"""Portfolio report engine: analytics on a chosen subset of positions.

The user ticks the positions to include; the report recomputes NAV, return,
volatility, Sharpe, Sortino and max drawdown on that selection only — so a book
can be analysed with or without any given line.

Method (honest, nothing fabricated): each selected position's value is
simulated day by day from its real daily price history (Yahoo, via the mapped
data_symbol) times the quantity currently held, converted to the display
currency. Summing those gives a reconstructed NAV series for the selection, and
every risk/return metric is derived from that series' daily returns. It is a
"current-holdings historical simulation" — it answers "how would the book I hold
today have behaved", so it assumes today's quantities across the window rather
than replaying every past trade. A position whose price history isn't available
(typically options) can't be simulated and is reported as skipped, never guessed.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from app import models
from app.services import fx, options, pnl, securities

RISK_FREE = 0.04  # annual, for the Black-76 option model

# Report period -> the Yahoo chart range that covers it.
PERIOD_RANGES = {
    "1mo": "1mo", "3mo": "6mo", "6mo": "6mo", "ytd": "ytd",
    "1y": "1y", "5y": "5y", "max": "max",
}
TRADING_DAYS = 252


def _daily_closes(symbol: str, range_key: str) -> dict[dt.date, float]:
    """Date -> close for a symbol over the range (empty if no history)."""
    chart = securities.fetch_chart(symbol, range_key)
    if not chart or not chart.get("points"):
        return {}
    # London lines quote in GBp (pence); the chart currency tells us. Normalise
    # so a .L series is on the same scale as the position's GBP marks.
    pence = (chart.get("currency") or "") == "GBp"
    out: dict[dt.date, float] = {}
    for pt in chart["points"]:
        c = pt.get("c")
        if c is None:
            continue
        d = dt.datetime.utcfromtimestamp(pt["t"]).date()
        out[d] = c / 100.0 if pence else c
    return out


def _option_price_series(pos: models.Position, range_key: str) -> dict[dt.date, float] | None:
    """Per-unit Black-76 price series for an option, off the underlying's real
    daily history, with vol calibrated to the option's current observed mark.
    None if the underlying can't be mapped/priced."""
    if not (pos.opt_strike and pos.opt_expiry and pos.opt_right and pos.underlying_symbol):
        return None
    yahoo_und = options.yahoo_underlying(pos.underlying_symbol)
    if not yahoo_und:
        return None
    und = _daily_closes(yahoo_und, range_key)
    if not und:
        return None
    K, right, expiry = pos.opt_strike, pos.opt_right, pos.opt_expiry
    today = dt.date.today()
    f_now = und[max(und)]
    t_now = max((expiry - today).days, 1) / 365.0
    sigma = options.implied_vol(pos.last_price, f_now, K, t_now, RISK_FREE, right)
    if sigma is None:
        sigma = 0.35
    out: dict[dt.date, float] = {}
    for d, f in und.items():
        t = (expiry - d).days / 365.0
        if t <= 0:
            continue
        out[d] = options.black76(f, K, t, sigma, RISK_FREE, right)
    return out or None


def _option_value_series(
    pos: models.Position, range_key: str, cutoff: dt.date, target_ccy: str, rates: dict
) -> dict[dt.date, float] | None:
    """Mark-to-model VALUE series (qty × price × mult × fx) for an option."""
    prices = _option_price_series(pos, range_key)
    if not prices:
        return None
    mult = pos.multiplier or 1.0
    fx1 = fx.convert(1.0, pos.currency, target_ccy, rates)
    out = {d: pos.quantity * p * mult * fx1 for d, p in prices.items() if d >= cutoff}
    return out or None


def _cutoff(period: str, today: dt.date) -> dt.date:
    if period == "1mo":
        return today - dt.timedelta(days=31)
    if period == "3mo":
        return today - dt.timedelta(days=93)
    if period == "6mo":
        return today - dt.timedelta(days=186)
    if period == "ytd":
        return dt.date(today.year, 1, 1)
    if period == "1y":
        return today - dt.timedelta(days=366)
    if period == "5y":
        return today - dt.timedelta(days=5 * 366)
    return dt.date(1970, 1, 1)


def build_report(
    db: Session,
    position_ids: list[int],
    period: str,
    target_ccy: str,
) -> dict:
    rates = fx.get_rates(db)
    range_key = PERIOD_RANGES.get(period, "1y")
    today = dt.date.today()
    cutoff = _cutoff(period, today)

    positions = (
        db.query(models.Position).filter(models.Position.id.in_(position_ids)).all()
        if position_ids else []
    )

    included: list[dict] = []
    skipped: list[dict] = []
    # position id -> (date -> value in target ccy)
    series_by_pos: dict[int, dict[dt.date, float]] = {}

    for pos in positions:
        mult = pos.multiplier or 1.0
        modeled = False

        if pos.asset_class in ("option", "future") or pos.opt_right:
            # No free historical option feed: reconstruct via Black-76 off the
            # underlying future's real history (flagged "modeled").
            values = _option_value_series(pos, range_key, cutoff, target_ccy, rates)
            if values is None:
                skipped.append({
                    "id": pos.id, "ticker": pos.ticker, "name": pos.name,
                    "reason": "Option sans sous-jacent modélisable",
                })
                continue
            modeled = True
        else:
            symbol = pos.data_symbol or pos.ticker
            closes = _daily_closes(symbol, range_key) if symbol else {}
            if not closes:
                skipped.append({
                    "id": pos.id, "ticker": pos.ticker, "name": pos.name,
                    "reason": "Pas d'historique de prix disponible",
                })
                continue
            values = {
                d: pos.quantity * c * mult * fx.convert(1.0, pos.currency, target_ccy, rates)
                for d, c in closes.items() if d >= cutoff
            }

        if not values:
            skipped.append({"id": pos.id, "ticker": pos.ticker, "name": pos.name,
                            "reason": "Historique trop court"})
            continue
        series_by_pos[pos.id] = values
        cur_val = fx.convert(pos.quantity * pos.last_price * mult, pos.currency, target_ccy, rates)
        included.append({"id": pos.id, "ticker": pos.ticker, "name": pos.name,
                         "value": cur_val, "modeled": modeled})

    if not series_by_pos:
        return {
            "period": period, "currency": target_ccy,
            "nav_series": [], "metrics": None,
            "included": included, "skipped": skipped,
        }

    total_value = sum(i["value"] for i in included)
    for i in included:
        i["weight"] = (i["value"] / total_value) if total_value else 0.0

    # Value-weighted daily RETURN index — not a raw sum of values. Positions have
    # different history lengths (e.g. a recent IPO with only a few weeks of
    # prices); summing absolute values makes the NAV lurch upward as each name's
    # history "switches on", producing absurd one-day returns. Instead, each day
    # the portfolio return is the value-weighted average of the returns of the
    # names that actually traded BOTH that day and the prior one, weights
    # renormalised over those active names. The index is then scaled so it ends
    # at the selection's real current value.
    weight = {i["id"]: i["value"] for i in included}
    rets_by_pos: dict[int, dict[dt.date, float]] = {}
    for pid, s in series_by_pos.items():
        ds = sorted(s)
        r: dict[dt.date, float] = {}
        for k in range(1, len(ds)):
            prev = s[ds[k - 1]]
            if prev > 0:
                r[ds[k]] = s[ds[k]] / prev - 1.0
        rets_by_pos[pid] = r

    ret_dates = sorted({d for r in rets_by_pos.values() for d in r})
    start_date = min(d for s in series_by_pos.values() for d in s)
    navs = [1.0]
    labels = [start_date]
    for d in ret_dates:
        num = den = 0.0
        for pid, r in rets_by_pos.items():
            if d in r:
                w = weight.get(pid, 0.0)
                num += w * r[d]
                den += w
        port_ret = (num / den) if den > 0 else 0.0
        navs.append(navs[-1] * (1 + port_ret))
        labels.append(d)

    scale = (total_value / navs[-1]) if navs[-1] else 1.0
    nav_series = [{"date": labels[i].isoformat(), "nav": round(navs[i] * scale, 2)} for i in range(len(navs))]

    metrics = _metrics(nav_series)

    return {
        "period": period, "currency": target_ccy,
        "nav_series": nav_series, "metrics": metrics,
        "included": sorted(included, key=lambda x: x["value"], reverse=True),
        "skipped": skipped,
    }


def _metrics(nav_series: list[dict]) -> dict | None:
    navs = [p["nav"] for p in nav_series]
    if len(navs) < 3:
        return None
    rets = [navs[i] / navs[i - 1] - 1.0 for i in range(1, len(navs)) if navs[i - 1] > 0]
    if len(rets) < 2:
        return None
    n = len(rets)
    mean = sum(rets) / n
    var = sum((r - mean) ** 2 for r in rets) / (n - 1)
    vol_daily = var ** 0.5
    ann_vol = vol_daily * (TRADING_DAYS ** 0.5)
    ann_return = (1 + mean) ** TRADING_DAYS - 1
    total_return = navs[-1] / navs[0] - 1.0
    sharpe = (mean / vol_daily) * (TRADING_DAYS ** 0.5) if vol_daily > 0 else None
    downside = [r for r in rets if r < 0]
    if downside:
        dvar = sum(r * r for r in downside) / len(downside)
        dstd = dvar ** 0.5
        sortino = (mean / dstd) * (TRADING_DAYS ** 0.5) if dstd > 0 else None
    else:
        sortino = None
    # Max drawdown on the NAV path.
    peak = navs[0]
    max_dd = 0.0
    for v in navs:
        peak = max(peak, v)
        if peak > 0:
            max_dd = min(max_dd, v / peak - 1.0)

    return {
        "start_nav": round(navs[0], 2),
        "end_nav": round(navs[-1], 2),
        "total_return": total_return,
        "annualised_return": ann_return,
        "annualised_vol": ann_vol,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": max_dd,
        "best_day": max(rets),
        "worst_day": min(rets),
        "observations": len(navs),
    }


# ==========================================================================
# Real, selection-adaptive reporting: start from the OFFICIAL IBKR NAV history
# and remove the P&L contribution of positions the user deselected/excluded, so
# the curve stays anchored to the real account yet reflects only the chosen
# names — "as if the others were never held".
# ==========================================================================

def _cum_qty_steps(db: Session, portfolio_id: int, ticker: str) -> list[tuple[dt.date, float]]:
    """Cumulative signed quantity held over time, from the trade blotter."""
    rows = (
        db.query(models.Trade.trade_date, models.Trade.side, models.Trade.quantity)
        .filter(models.Trade.portfolio_id == portfolio_id, models.Trade.ticker == ticker)
        .order_by(models.Trade.trade_date)
        .all()
    )
    cum = 0.0
    steps: list[tuple[dt.date, float]] = []
    for td, side, q in rows:
        cum += q if side == "BUY" else -q
        steps.append((td, cum))
    return steps


def _qty_on(steps: list[tuple[dt.date, float]], d: dt.date, fallback: float) -> float:
    """Quantity held on date d (0 before the first trade). Falls back to the
    current quantity when there is no trade history for the name."""
    if not steps:
        return fallback
    if d < steps[0][0]:
        return 0.0
    q = 0.0
    for td, c in steps:
        if td <= d:
            q = c
        else:
            break
    return q


def _price_on(sorted_dates: list[dt.date], prices: dict[dt.date, float], d: dt.date) -> float | None:
    """Last known price at or before d (forward-fill)."""
    import bisect
    i = bisect.bisect_right(sorted_dates, d) - 1
    return prices[sorted_dates[i]] if i >= 0 else None


def _excluded_pnl_by_date(
    db: Session, portfolio: models.Portfolio, base_ccy: str, rates: dict, position_ids: set[int]
) -> dict[dt.date, float]:
    """Total unrealised P&L (in the portfolio's base ccy) of the positions in
    `position_ids`, on each date the portfolio's NAV history covers. This is the
    amount to subtract from the official NAV to drop those names."""
    targets = [p for p in portfolio.positions if p.id in position_ids]
    nav_dates = sorted({h.date for h in portfolio.nav_history})
    if not targets or not nav_dates:
        return {}
    out: dict[dt.date, float] = {d: 0.0 for d in nav_dates}
    for pos in targets:
        # Only adjust the REAL NAV history with REAL prices. Options have no free
        # historical price (a single-vol Black-76 misprices past dates badly), so
        # they're dropped from the current figures but left in the historical
        # curve — flagged to the caller instead of faked.
        if pos.asset_class in ("option", "future") or pos.opt_right:
            continue
        prices = _daily_closes(pos.data_symbol or pos.ticker, "5y")
        if not prices:
            continue  # no real history → don't touch the real curve
        sorted_pd = sorted(prices)
        steps = _cum_qty_steps(db, portfolio.id, pos.ticker)
        mult = pos.multiplier or 1.0
        fx1 = fx.convert(1.0, pos.currency, base_ccy, rates)
        for d in nav_dates:
            qty = _qty_on(steps, d, pos.quantity)
            if qty == 0:
                continue
            price = _price_on(sorted_pd, prices, d)
            if price is None:
                continue
            out[d] += qty * (price - pos.avg_cost) * mult * fx1
    return out


def _twr_from_combined(
    all_dates: list[dt.date], combined: list[float], client: models.Client,
    rates: dict, ccy: str, start_date: dt.date | None,
) -> float | None:
    """Chain-linked TWR from a combined NAV series and the client's cash flows."""
    if start_date is not None:
        idx = [i for i, d in enumerate(all_dates) if d >= start_date]
        if len(idx) < 2:
            prior = [i for i, d in enumerate(all_dates) if d <= start_date]
            start_i = prior[-1] if prior else 0
        else:
            start_i = idx[0]
        all_dates = all_dates[start_i:]
        combined = combined[start_i:]
    if len(combined) < 2:
        return None
    twr = 1.0
    for i in range(1, len(all_dates)):
        flows = pnl._client_flows(
            client, rates, ccy,
            start=all_dates[i - 1] + dt.timedelta(days=1), end=all_dates[i],
        )
        denom = combined[i - 1] + flows
        if denom <= 0:
            continue
        twr *= combined[i] / denom
    return twr - 1.0


def client_adjusted_performance(
    db: Session, client: models.Client, rates: dict, target_ccy: str, as_of: dt.date,
    excluded_ids: set[int],
) -> dict | None:
    """Real IBKR NAV history adjusted to drop `excluded_ids`, plus recomputed
    TWR. None when nothing is excluded (caller keeps the official figures)."""
    if not excluded_ids:
        return None
    nav_by_portfolio: dict[int, list[dict]] = {}
    combined: dict[dt.date, float] = {}
    for pf in client.portfolios:
        adj_pnl = _excluded_pnl_by_date(db, pf, pf.base_currency, rates, excluded_ids)
        rows = sorted(pf.nav_history, key=lambda h: h.date)
        series = []
        for h in rows:
            nav_base = h.nav - adj_pnl.get(h.date, 0.0)
            series.append({"date": h.date.isoformat(), "nav": round(nav_base, 2)})
            combined[h.date] = combined.get(h.date, 0.0) + fx.convert(nav_base, pf.base_currency, target_ccy, rates)
        nav_by_portfolio[pf.id] = series

    all_dates = sorted(combined)
    combined_navs = [combined[d] for d in all_dates]
    year_start = dt.date(as_of.year, 1, 1)
    return {
        "nav_by_portfolio": nav_by_portfolio,
        "twr_ytd": _twr_from_combined(all_dates, combined_navs, client, rates, target_ccy, year_start),
        "twr_since_inception": _twr_from_combined(all_dates, combined_navs, client, rates, target_ccy, None),
    }
