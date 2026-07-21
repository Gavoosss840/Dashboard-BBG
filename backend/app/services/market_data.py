"""Free end-of-day market data: Yahoo Finance for prices, open.er-api.com for FX.

This is deliberately behind small functions so a paid provider (EODHD,
Polygon…) can be swapped in later without touching the rest of the app.
Position marks primarily come from the IBKR sync (official custodian prices);
Yahoo fills the watchlist and refreshes positions between syncs.
"""

from __future__ import annotations

import datetime as dt

import requests
from sqlalchemy.orm import Session

from app import models

YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
FX_URL = "https://open.er-api.com/v6/latest/USD"
_HEADERS = {"User-Agent": "Mozilla/5.0 (BouletCapital internal terminal)"}


def fetch_yahoo_quote(symbol: str) -> tuple[float, float] | None:
    """Return (last_price, day_change_pct) or None if the symbol is unknown.

    London lines quote on Yahoo in GBp (pence): a price of 6628 means £66.28.
    IBKR reports the same holding in GBP, so we normalise pence to the major
    unit — otherwise a .L position's live mark comes back 100x its real value.
    """
    try:
        resp = requests.get(
            YAHOO_CHART_URL.format(symbol=symbol),
            params={"interval": "1d", "range": "5d"},
            headers=_HEADERS,
            timeout=15,
        )
        if resp.status_code != 200:
            return None
        meta = resp.json()["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        if price is None:
            return None
        change = ((price / prev) - 1) * 100 if prev else 0.0
        if (meta.get("currency") or "") == "GBp":  # pence -> pounds
            price = price / 100.0
        return float(price), float(change)
    except Exception:
        return None


def fetch_fx_rates() -> dict[str, float] | None:
    """Rates as units of CCY per 1 USD, for EVERY currency the API returns.

    Not filtered to a hardcoded shortlist: an IBKR book holds positions and
    cash in whatever currency the underlying trades in (SAR, AUD, CAD, TWD,
    KRW...). A currency missing from the rate table converts 1:1 with USD in
    fx.convert() — silently and massively mis-valuing e.g. a SAR position
    (~0.27 USD) as if 1 SAR = 1 USD. Storing the full set the free endpoint
    returns means any currency IBKR reports already has a real rate.
    """
    try:
        resp = requests.get(FX_URL, headers=_HEADERS, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        if data.get("result") != "success":
            return None
        out: dict[str, float] = {}
        for ccy, rate in data["rates"].items():
            try:
                out[ccy.upper()] = float(rate)
            except (TypeError, ValueError):
                continue
        return out or None
    except Exception:
        return None


def refresh_market_data(db: Session) -> models.SyncLog:
    log = models.SyncLog(kind="market_data", started_at=dt.datetime.utcnow())
    db.add(log)
    db.commit()

    updated_fx = 0
    updated_watchlist = 0
    updated_positions = 0
    failed: list[str] = []

    try:
        fx_rates = fetch_fx_rates()
        if fx_rates:
            now = dt.datetime.utcnow()
            for ccy, rate in fx_rates.items():
                row = db.query(models.FXRate).filter(models.FXRate.ccy == ccy).first()
                if row:
                    row.rate_vs_usd = rate
                    row.updated_at = now
                else:
                    db.add(models.FXRate(ccy=ccy, rate_vs_usd=rate, updated_at=now))
                updated_fx += 1

        # Watchlist: use data_symbol override when set (foreign listings)
        for item in db.query(models.WatchlistItem).all():
            symbol = item.data_symbol or item.ticker
            quote = fetch_yahoo_quote(symbol)
            if quote is None:
                failed.append(symbol)
                continue
            item.last_price, item.day_change_pct = quote
            updated_watchlist += 1

        # Positions: refresh marks between IBKR syncs using the mapped Yahoo
        # data_symbol (RIO.L, CMM.AX...) rather than the raw IBKR ticker, which
        # rarely resolves for foreign listings. The official mark from the next
        # sync remains the source of truth; this just keeps intraday values live.
        seen: dict[str, tuple[float, float] | None] = {}
        for pos in db.query(models.Position).all():
            symbol = pos.data_symbol or pos.ticker
            if not symbol:
                continue
            if symbol not in seen:
                seen[symbol] = fetch_yahoo_quote(symbol)
            quote = seen[symbol]
            if quote is None:
                continue
            pos.last_price = quote[0]
            updated_positions += 1

        message = (
            f"{updated_fx} taux FX, {updated_watchlist} valeurs de watchlist, "
            f"{updated_positions} positions mises à jour."
        )
        if failed:
            message += (
                f" ⚠ Symboles introuvables sur Yahoo: {', '.join(sorted(set(failed))[:8])} "
                f"— renseignez le 'symbole data' (ex: 0700.HK, MC.PA, NESN.SW)."
            )
        if not fx_rates:
            message += " ⚠ Taux FX non joignables (open.er-api.com)."
        log.status = "success"
        log.message = message
    except Exception as exc:
        log.status = "error"
        log.message = str(exc)
    log.finished_at = dt.datetime.utcnow()
    db.commit()
    return log
