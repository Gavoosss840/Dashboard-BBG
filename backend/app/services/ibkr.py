"""Interactive Brokers integration via the Flex Web Service.

Why Flex (and not TWS/Gateway): Flex queries return the custodian's OFFICIAL
end-of-day statements — positions with official marks, executed trades, cash
movements, and the account NAV — over plain HTTPS with a token. No gateway
process to babysit, no daily re-authentication. It is the right backbone for
a portfolio-management terminal; a live Gateway connection can be added later
for intraday streaming without touching this module.

Setup (once, in IBKR Account Management):
  1. Performance & Reports → Flex Queries → create an *Activity Flex Query*
     including these sections: Open Positions, Trades, Cash Transactions,
     Cash Report, Net Asset Value (NAV) in Base. Period: "Last Business Day"
     (or "Month to Date" for backfill). Format XML.
  2. Settings → Account Settings → Flex Web Service → enable, generate token.
  3. Put both in the environment: IBKR_FLEX_TOKEN, IBKR_FLEX_QUERY_ID.

Account mapping: each FlexStatement carries an accountId ("U1234567") which
must match a Portfolio.ptf_id in the platform. Unmatched accounts are
reported, not silently dropped.
"""

from __future__ import annotations

import datetime as dt
import os
import time
import xml.etree.ElementTree as ET

import requests
from sqlalchemy.orm import Session

from app import models

FLEX_SEND_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest"
FLEX_GET_URL = "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement"


def flex_config() -> tuple[str | None, str | None]:
    """Legacy single-connection pair (kept for backward compatibility)."""
    return os.environ.get("IBKR_FLEX_TOKEN") or None, os.environ.get("IBKR_FLEX_QUERY_ID") or None


def flex_connections() -> list[tuple[str, str, str]]:
    """All configured IBKR Flex connections as (label, token, query_id).

    Two clients on two separate IBKR logins need two tokens, so we read:
      - the legacy pair IBKR_FLEX_TOKEN / IBKR_FLEX_QUERY_ID (docker-compose.yml),
      - numbered pairs IBKR_FLEX_TOKEN_1..N / IBKR_FLEX_QUERY_ID_1..N, and
      - connections entered through the platform UI (Données & Synchro),
        stored in a local file next to the database (see ibkr_credentials.py).
    Either way, tokens live only on the user's machine — never in the
    database, so they never reach a backup.
    """
    from app.services import ibkr_credentials  # local import: avoid a hard dependency at module load

    conns: list[tuple[str, str, str]] = []
    token, query_id = flex_config()
    if token and query_id:
        conns.append(("principal", token, query_id))
    # Numbered connections; stop at the first gap after a reasonable range.
    for i in range(1, 21):
        t = os.environ.get(f"IBKR_FLEX_TOKEN_{i}")
        q = os.environ.get(f"IBKR_FLEX_QUERY_ID_{i}")
        if t and q:
            conns.append((f"connexion {i}", t, q))
    for row in ibkr_credentials.list_connections():
        conns.append((row["label"], row["token"], row["query_id"]))
    return conns


def is_configured() -> bool:
    return len(flex_connections()) > 0


class FlexError(Exception):
    pass


def fetch_flex_statement(token: str, query_id: str, max_wait_seconds: int = 60) -> str:
    """Two-step Flex fetch: request generation, then poll for the statement."""
    resp = requests.get(FLEX_SEND_URL, params={"t": token, "q": query_id, "v": "3"}, timeout=30)
    resp.raise_for_status()
    root = ET.fromstring(resp.text)
    status = (root.findtext("Status") or "").strip()
    if status != "Success":
        code = root.findtext("ErrorCode") or "?"
        message = root.findtext("ErrorMessage") or resp.text[:300]
        raise FlexError(f"IBKR a refusé la requête Flex (code {code}): {message}")
    reference = root.findtext("ReferenceCode")
    get_url = root.findtext("Url") or FLEX_GET_URL

    deadline = time.time() + max_wait_seconds
    while True:
        resp = requests.get(get_url, params={"t": token, "q": reference, "v": "3"}, timeout=60)
        resp.raise_for_status()
        text = resp.text
        if "<FlexQueryResponse" in text:
            return text
        # Statement not ready yet comes back as a FlexStatementResponse error
        if time.time() > deadline:
            root = ET.fromstring(text)
            message = root.findtext("ErrorMessage") or text[:300]
            raise FlexError(f"Le relevé Flex n'était pas prêt après {max_wait_seconds}s: {message}")
        time.sleep(3)


# ---------- Parsing helpers ----------

def _attr(el: ET.Element, *names: str, default: str = "") -> str:
    for n in names:
        v = el.get(n)
        if v is not None and v != "":
            return v
    return default


def _num(el: ET.Element, *names: str) -> float:
    raw = _attr(el, *names, default="0")
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return 0.0


def _date(raw: str) -> dt.date | None:
    raw = raw.split(";")[0].split(",")[0].strip()
    for fmt in ("%Y%m%d", "%Y-%m-%d"):
        try:
            return dt.datetime.strptime(raw[:10] if "-" in raw else raw[:8], fmt).date()
        except ValueError:
            continue
    return None


def _latest_snapshot(elements: list[ET.Element], *key_names: str) -> list[ET.Element]:
    """Collapse a repeated daily series to one row per identity — the latest.

    IBKR's "Détailler par jour = Oui" (Detail by day) emits one row per position
    (or per cash currency) FOR EACH DAY of the query period, all inside the same
    statement, each tagged with a reportDate. Importing them all would insert a
    given position once per day — duplicating the whole book and multiplying
    every valuation. Grouping on the identity key and keeping the row with the
    greatest reportDate reduces the series back to the current snapshot, and
    works whether detail-by-day is on or off (a single row simply wins trivially).
    """
    best: dict[tuple, ET.Element] = {}
    best_date: dict[tuple, str] = {}
    for el in elements:
        key = tuple(_attr(el, n) for n in key_names)
        rd = _attr(el, "reportDate", "toDate", "date", "reportDateTime")
        if key not in best or rd >= best_date.get(key, ""):
            best[key] = el
            best_date[key] = rd
    return list(best.values())


ASSET_CLASS_MAP = {
    "STK": "equity", "ETF": "etf", "FUND": "fund", "BOND": "bond", "BILL": "bond",
    "OPT": "option", "FOP": "option", "FUT": "future", "CASH": "fx", "CRYPTO": "crypto",
    "CFD": "cfd", "WAR": "warrant",
}

# IBKR listing exchange -> Yahoo Finance symbol suffix. US venues carry no
# suffix; everything else needs one for Yahoo to resolve the right listing.
_YAHOO_SUFFIX_BY_EXCHANGE = {
    "NASDAQ": "", "NYSE": "", "AMEX": "", "ARCA": "", "BATS": "", "IEX": "",
    "PINK": "", "NMS": "", "PSE": "", "NYSENAT": "",
    "LSE": ".L", "LSEETF": ".L",
    "ASX": ".AX",
    "TSE": ".TO", "TSX": ".TO", "VENTURE": ".V", "TSXV": ".V",
    "TADAWUL": ".SR",
    "TWSE": ".TW",
    "SEHK": ".HK", "SEHKNTL": ".HK",
    "SGX": ".SI",
    "TSEJ": ".T",
    "KSE": ".KS",
    "NSE": ".NS", "BSE": ".BO",
    "FWB": ".F", "SWB": ".SG", "IBIS": ".DE", "IBIS2": ".DE", "GETTEX": ".DE",
    "SBF": ".PA", "AEB": ".AS", "ENEXT.BE": ".BR",
    "BVME": ".MI", "BVME.ETF": ".MI",
    "BM": ".MC", "MEFFRV": ".MC",
    "SFB": ".ST", "OMXNO": ".OL", "CPH": ".CO", "HEX": ".HE",
    "VSE": ".VI", "EBS": ".SW",
}


def _yahoo_symbol(ib_symbol: str, listing_exchange: str) -> str:
    """Best-effort Yahoo symbol for an IBKR listing (symbol + venue suffix).

    Handles the two common IBKR/Yahoo shape differences: class shares use a
    space in IBKR but a dash on Yahoo ("BRK B" -> "BRK-B"), and IBKR sometimes
    appends a lowercase class letter to a London line ("RIOl" -> "RIO"). It is
    intentionally conservative — the position keeps an editable data_symbol, so
    an odd ticker Yahoo names differently (e.g. a GDR) can be fixed by hand
    rather than guessed wrong.
    """
    sym = (ib_symbol or "").strip()
    if not sym:
        return ""
    suffix = _YAHOO_SUFFIX_BY_EXCHANGE.get((listing_exchange or "").upper().strip())
    base = sym.replace(" ", "-").upper()
    # A trailing lowercase letter on the raw IBKR symbol is a class marker, not
    # part of the Yahoo root (RIOl -> RIO); only strip when it left a dangling
    # single letter after an otherwise clean root.
    if len(sym) > 1 and sym[-1].islower() and sym[:-1].isalpha():
        base = sym[:-1].upper()
    if suffix is None:
        # Unknown venue: for a US-looking (plain alpha) ticker, no suffix is the
        # safe guess; otherwise leave blank so the editable field prompts a fix.
        return base if base.isalpha() else ""
    return base + suffix


TRADE_COMMIT_BATCH = 500  # flush+commit this often during the trades loop


def import_flex(xml_text: str, db: Session) -> dict:
    """Import a Flex statement into the platform. Idempotent: positions and
    balances are replaced, trades/cash-flows/NAV points are deduplicated.

    Dedup is checked against Python sets loaded with one query each up
    front, not with a SELECT per row. A large, actively-traded algo account
    can carry tens of thousands of trades — checking existence row-by-row
    meant tens of thousands of synchronous round trips inside a single
    transaction, which held SQLite's write lock long enough to stall every
    other request on the platform for the whole duration of the sync.
    Commits are also flushed periodically during the trades loop so that
    lock is never held for the entire import at once.
    """
    root = ET.fromstring(xml_text)
    portfolios_by_account = {p.ptf_id: p for p in db.query(models.Portfolio).all()}

    existing_exec_ids: set[str] = {row[0] for row in db.query(models.Trade.ibkr_exec_id).all()}
    existing_cash_flow_keys: set[tuple] = {
        (r.client_id, r.date, r.amount, r.currency, r.flow_type)
        for r in db.query(
            models.CashFlow.client_id, models.CashFlow.date, models.CashFlow.amount,
            models.CashFlow.currency, models.CashFlow.flow_type,
        ).all()
    }
    existing_nav: dict[tuple, models.NavHistory] = {
        (r.portfolio_id, r.date): r for r in db.query(models.NavHistory).all()
    }

    stats = {
        "accounts_matched": [], "accounts_unmatched": [],
        "positions": 0, "trades_new": 0, "trades_skipped": 0,
        "cash_flows_new": 0, "nav_points": 0, "cash_balances": 0,
    }
    trades_since_commit = 0
    touched_portfolio_ids: set[int] = set()

    for stmt in root.iter("FlexStatement"):
        account_id = _attr(stmt, "accountId")
        portfolio = portfolios_by_account.get(account_id)
        if portfolio is None:
            if account_id and account_id not in stats["accounts_unmatched"]:
                stats["accounts_unmatched"].append(account_id)
            continue
        stats["accounts_matched"].append(account_id)
        touched_portfolio_ids.add(portfolio.id)
        client_id = portfolio.client_id

        # ---- Open positions: replace wholesale with the custodian's view ----
        open_positions = list(stmt.iter("OpenPosition"))
        # Reduce a detail-by-day series (same symbol repeated per day) to the
        # latest snapshot per contract — otherwise the whole book is imported
        # once per day of the period. conid is IBKR's unique contract id; fall
        # back to symbol+currency when it's absent.
        open_positions = _latest_snapshot(open_positions, "conid", "symbol", "currency")
        if open_positions:
            # flush first: the session has autoflush=False, and a multi-day Flex
            # Query period can also return one <FlexStatement> per day. Without an
            # explicit flush, a still-pending (unflushed) insert from an EARLIER
            # statement in this same loop is invisible to this bulk delete — it
            # isn't in the table yet, so it can't be removed — and both days'
            # snapshots end up committed together, duplicating every position
            # that appears in more than one day's statement.
            db.flush()
            db.query(models.Position).filter(models.Position.portfolio_id == portfolio.id).delete(
                synchronize_session=False
            )
            for op in open_positions:
                qty = _num(op, "position", "quantity")
                if qty == 0:
                    continue
                mark = _num(op, "markPrice")  # per-share, position's LOCAL currency
                # Options/futures settle on quantity * price * multiplier (e.g. 100
                # for a standard equity option) — IBKR always reports it, including
                # "1" for stocks/ETFs. Falling back to 1 covers older exports that
                # omit the attribute entirely.
                multiplier = _num(op, "multiplier") or 1.0
                # IBKR mixes currencies within one OpenPosition element: per-share
                # price fields (markPrice, costBasisPrice) are in the position's
                # LOCAL/trading currency, but aggregate value/P&L fields (costBasis,
                # fifoPnlUnrealized) are in the ACCOUNT'S BASE currency — e.g. a
                # SAR-quoted Saudi stock on a EUR account reports its price in SAR
                # but its cost/P&L totals in EUR. avg_cost must stay in LOCAL
                # currency (everything downstream, incl. fx.convert(), assumes
                # pos.currency), so base-currency fallbacks need converting back to
                # local via IBKR's own per-position rate before use — mixing the two
                # unconverted, as an earlier version of this code did, silently
                # corrupts the cost basis for every non-base-currency position.
                fx_to_base = _num(op, "fxRateToBase") or 1.0
                # Per-share cost basis, tried in decreasing order of reliability:
                #   1. costBasisPrice/openPrice — a direct per-share figure, local.
                #   2. costBasis (total position cost, BASE ccy) / quantity —
                #      converted back to local — some Flex Query configurations
                #      only expose the total, not a per-share price.
                #   3. Back out avg_cost from IBKR's own already-computed
                #      fifoPnlUnrealized (BASE ccy, converted back to local), so
                #      downstream (mark - avg_cost) * qty * multiplier, converted to
                #      the display currency, reproduces the P&L IBKR reports — this
                #      is present on effectively every Flex export regardless of
                #      which cost-basis fields the query includes.
                #   4. left at 0 — a sentinel meaning "no cost in the statement";
                #      backfilled from the imported trades after this loop, and
                #      only then falling back to mark (0 P&L) if there are no
                #      trades either. IBKR frequently reports every cost field as
                #      0 on SUMMARY-level open positions, so this backfill is the
                #      normal path, not an edge case.
                cost = _num(op, "costBasisPrice", "openPrice")
                if not cost:
                    # IBKR's total-cost attribute is "costBasisMoney" (the older
                    # "costBasis" is accepted too for exports that use it).
                    total_cost_base = _num(op, "costBasisMoney", "costBasis")
                    if total_cost_base and qty:
                        total_cost_local = total_cost_base / fx_to_base
                        cost = abs(total_cost_local / qty)
                if not cost:
                    fifo_pnl_base = _num(op, "fifoPnlUnrealized")
                    denom = qty * multiplier
                    if fifo_pnl_base and denom:
                        fifo_pnl_local = fifo_pnl_base / fx_to_base
                        cost = mark - fifo_pnl_local / denom
                ib_symbol = _attr(op, "symbol")
                listing_exchange = _attr(op, "listingExchange", "exchange")
                # Options/futures price off Yahoo poorly; only map cash equities
                # and ETFs to a Yahoo data symbol.
                asset_cat = _attr(op, "assetCategory").upper().split()[0] if _attr(op, "assetCategory") else ""
                data_symbol = _yahoo_symbol(ib_symbol, listing_exchange) if asset_cat in ("STK", "ETF", "") else ""
                db.add(models.Position(
                    portfolio_id=portfolio.id,
                    ticker=ib_symbol,
                    name=_attr(op, "description", "symbol"),
                    asset_class=ASSET_CLASS_MAP.get(asset_cat, "equity"),
                    sector=_attr(op, "subCategory"),
                    region="",
                    currency=_attr(op, "currency", default="USD"),
                    quantity=qty,
                    avg_cost=cost,
                    last_price=mark,
                    multiplier=multiplier,
                    listing_exchange=listing_exchange,
                    data_symbol=data_symbol,
                ))
                stats["positions"] += 1

        # ---- Trades: dedup on IBKR execution/trade id (bulk-loaded set) ----
        for tr in stmt.iter("Trade"):
            exec_id = _attr(tr, "ibExecID", "tradeID", "transactionID")
            if not exec_id:
                continue
            if exec_id in existing_exec_ids:
                stats["trades_skipped"] += 1
                continue
            trade_date = _date(_attr(tr, "tradeDate", "dateTime"))
            if trade_date is None:
                continue
            qty = _num(tr, "quantity")
            side = _attr(tr, "buySell").upper() or ("BUY" if qty >= 0 else "SELL")
            db.add(models.Trade(
                portfolio_id=portfolio.id,
                trade_date=trade_date,
                side="BUY" if side.startswith("B") else "SELL",
                ticker=_attr(tr, "symbol"),
                name=_attr(tr, "description", "symbol"),
                asset_class=ASSET_CLASS_MAP.get(_attr(tr, "assetCategory").upper(), "equity"),
                currency=_attr(tr, "currency", default="USD"),
                quantity=abs(qty),
                price=_num(tr, "tradePrice", "price"),
                commission=abs(_num(tr, "ibCommission", "commission")),
                realized_pnl=_num(tr, "fifoPnlRealized"),
                source="ibkr",
                ibkr_exec_id=exec_id,
            ))
            existing_exec_ids.add(exec_id)
            stats["trades_new"] += 1
            trades_since_commit += 1
            if trades_since_commit >= TRADE_COMMIT_BATCH:
                db.commit()
                trades_since_commit = 0

        # ---- Cash transactions (deposits/withdrawals) -> client CashFlow ----
        for ct in stmt.iter("CashTransaction"):
            ct_type = _attr(ct, "type")
            if "deposit" not in ct_type.lower() and "withdraw" not in ct_type.lower():
                continue  # dividends/interest/fees are P&L, not client flows
            flow_date = _date(_attr(ct, "dateTime", "reportDate", "settleDate"))
            if flow_date is None:
                continue
            amount = _num(ct, "amount")
            currency = _attr(ct, "currency", default="USD")
            flow_type = "deposit" if amount >= 0 else "withdrawal"
            key = (client_id, flow_date, abs(amount), currency, flow_type)
            if key in existing_cash_flow_keys:
                continue
            db.add(models.CashFlow(
                client_id=client_id, date=flow_date,
                flow_type=flow_type, amount=abs(amount), currency=currency,
            ))
            existing_cash_flow_keys.add(key)
            stats["cash_flows_new"] += 1

        # ---- Official NAV history ----
        for eq in list(stmt.iter("EquitySummaryByReportDateInBase")) + list(stmt.iter("EquitySummaryInBase")):
            report_date = _date(_attr(eq, "reportDate"))
            total = _num(eq, "total")
            if report_date is None or total == 0:
                continue
            nav_key = (portfolio.id, report_date)
            existing = existing_nav.get(nav_key)
            if existing:
                existing.nav = total
            else:
                new_nav = models.NavHistory(portfolio_id=portfolio.id, date=report_date, nav=total)
                db.add(new_nav)
                existing_nav[nav_key] = new_nav
            stats["nav_points"] += 1

        # ---- Cash balances per currency (replace) ----
        # A margin account that shorts securities (any long/short book) reports
        # cash per SEGMENT as well as per currency — e.g. a "Securities" row and
        # a "Futures" row both carrying currency="USD" — when the Flex Query has
        # per-segment detail enabled. Summing every row blindly double- or
        # triple-counts cash. levelOfDetail="Currency" is the netted, segment-
        # independent figure; keep only that level when it's present, and as a
        # final guard never keep more than one row per currency.
        cash_rows_raw = [
            cr for cr in stmt.iter("CashReportCurrency")
            if _attr(cr, "currency").upper() not in ("", "BASE_SUMMARY")
        ]
        detail_levels = {_attr(cr, "levelOfDetail") for cr in cash_rows_raw}
        if "Currency" in detail_levels:
            cash_rows_raw = [cr for cr in cash_rows_raw if _attr(cr, "levelOfDetail") == "Currency"]
        # Keep one row per currency — the latest reportDate — so detail-by-day
        # (a row per currency per day) doesn't leave several balances per
        # currency, and a same-day duplicate never wins over the current one.
        cash_rows = _latest_snapshot(cash_rows_raw, "currency")
        if cash_rows:
            # Same multi-day-statement/autoflush hazard as the positions block
            # above — flush pending inserts from an earlier statement before
            # this bulk delete, or they survive alongside today's balances.
            db.flush()
            db.query(models.CashBalance).filter(models.CashBalance.portfolio_id == portfolio.id).delete(
                synchronize_session=False
            )
            for cr in cash_rows:
                ending = _num(cr, "endingCash", "endingSettledCash")
                db.add(models.CashBalance(
                    portfolio_id=portfolio.id,
                    currency=_attr(cr, "currency", default="USD").upper(),
                    amount=ending,
                ))
                stats["cash_balances"] += 1

    db.commit()

    # Fill the cost basis IBKR left at 0 (see the sentinel above) from the
    # trades we just imported — the only place the entry prices actually live
    # when open positions come through at SUMMARY level.
    if touched_portfolio_ids:
        _backfill_cost_from_trades(db, touched_portfolio_ids)

    return stats


def _backfill_cost_from_trades(db: Session, portfolio_ids: set[int]) -> None:
    """Set avg_cost for positions the statement carried without a cost basis.

    IBKR's SUMMARY-level OpenPositions frequently report costBasisPrice,
    costBasisMoney and fifoPnlUnrealized all as 0 — so avg_cost lands at 0 and
    the whole book shows 0 unrealized P&L. The executed trades, however, carry
    the real entry prices. We rebuild a per-contract average entry cost from the
    BUY trades (average-cost method: a partial sell leaves the remaining shares'
    average untouched, so the mean buy price is the right cost basis) in the
    position's own currency, and apply it only where a cost is still missing —
    positions IBKR did price keep their official figure. A position with no
    matching trade at all (e.g. transferred in) falls back to its mark, an
    honest 0 P&L rather than a fabricated one.
    """
    for pid in portfolio_ids:
        buy_qty: dict[tuple, float] = {}
        buy_cost: dict[tuple, float] = {}
        for ticker, currency, side, qty, price in db.query(
            models.Trade.ticker, models.Trade.currency, models.Trade.side,
            models.Trade.quantity, models.Trade.price,
        ).filter(models.Trade.portfolio_id == pid).all():
            if side != "BUY" or not qty or not price:
                continue
            key = (ticker, currency)
            buy_qty[key] = buy_qty.get(key, 0.0) + qty
            buy_cost[key] = buy_cost.get(key, 0.0) + qty * price

        positions = db.query(models.Position).filter(models.Position.portfolio_id == pid).all()
        for pos in positions:
            if pos.avg_cost and pos.avg_cost > 0:
                continue  # IBKR gave us a real cost — keep it
            key = (pos.ticker, pos.currency)
            q = buy_qty.get(key, 0.0)
            pos.avg_cost = (buy_cost[key] / q) if q > 0 else pos.last_price
    db.commit()


def run_sync(db: Session) -> models.SyncLog:
    """Full sync run, recorded in SyncLog."""
    log = models.SyncLog(kind="ibkr", started_at=dt.datetime.utcnow())
    db.add(log)
    db.commit()

    connections = flex_connections()
    try:
        if not connections:
            raise FlexError(
                "IBKR non configuré : renseignez IBKR_FLEX_TOKEN(_1) et IBKR_FLEX_QUERY_ID(_1) "
                "dans docker-compose.yml puis redémarrez."
            )

        totals = {"positions": 0, "trades_new": 0, "cash_flows_new": 0, "nav_points": 0}
        matched: list[str] = []
        unmatched: list[str] = []
        errors: list[str] = []

        for label, token, query_id in connections:
            try:
                xml_text = fetch_flex_statement(token, query_id)
                stats = import_flex(xml_text, db)
                for k in totals:
                    totals[k] += stats[k]
                matched.extend(stats["accounts_matched"])
                unmatched.extend(a for a in stats["accounts_unmatched"] if a not in unmatched)
            except Exception as exc:
                # one failing connection must not abort the others
                errors.append(f"{label}: {exc}")

        if matched or totals["positions"] or not errors:
            matched_str = ", ".join(matched) or "aucun"
            message = (
                f"{len(connections)} connexion(s) IBKR. Comptes synchronisés: {matched_str}. "
                f"{totals['positions']} positions, {totals['trades_new']} nouveaux trades, "
                f"{totals['cash_flows_new']} mouvements de cash, {totals['nav_points']} points de NAV."
            )
            if unmatched:
                message += (
                    f" ⚠ Comptes IBKR sans portefeuille correspondant: {', '.join(unmatched)} "
                    f"— créez un portefeuille avec cet ID (champ 'ID Portefeuille') pour les importer."
                )
            if errors:
                message += " ⚠ Connexions en échec — " + " ; ".join(errors)
            log.status = "success" if matched or totals["positions"] else "error"
            log.message = message
        else:
            # every connection failed
            log.status = "error"
            log.message = "Échec de toutes les connexions IBKR — " + " ; ".join(errors)
    except Exception as exc:  # keep the log row even on failure
        log.status = "error"
        log.message = str(exc)
    log.finished_at = dt.datetime.utcnow()
    db.commit()
    return log
