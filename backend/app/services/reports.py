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
from app.services import fx, securities

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
        symbol = pos.data_symbol or pos.ticker
        closes = _daily_closes(symbol, range_key) if symbol else {}
        # Options/futures and anything Yahoo can't price historically: no series.
        if not closes or pos.asset_class in ("option", "future"):
            skipped.append({
                "id": pos.id, "ticker": pos.ticker, "name": pos.name,
                "reason": "Pas d'historique de prix disponible" if not closes else "Instrument dérivé",
            })
            continue
        mult = pos.multiplier or 1.0
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
        included.append({"id": pos.id, "ticker": pos.ticker, "name": pos.name, "value": cur_val})

    if not series_by_pos:
        return {
            "period": period, "currency": target_ccy,
            "nav_series": [], "metrics": None,
            "included": included, "skipped": skipped,
        }

    # Union of dates where at least one position trades; sum values across
    # positions that have a close that day (forward-fill missing days per pos).
    all_dates = sorted({d for s in series_by_pos.values() for d in s})
    last_val: dict[int, float] = {}
    nav_series: list[dict] = []
    for d in all_dates:
        total = 0.0
        for pid, s in series_by_pos.items():
            if d in s:
                last_val[pid] = s[d]
            if pid in last_val:
                total += last_val[pid]
        nav_series.append({"date": d.isoformat(), "nav": round(total, 2)})

    metrics = _metrics(nav_series)
    total_value = sum(i["value"] for i in included)
    for i in included:
        i["weight"] = (i["value"] / total_value) if total_value else 0.0

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
