"""Portfolio report engine: analytics on a chosen subset of positions.

The user ticks the positions to include; the report recomputes NAV, return,
volatility, Sharpe, Sortino and max drawdown on that selection only — so a book
can be analysed with or without any given line.

Method (honest, nothing fabricated). The report is anchored on the REAL account:
it starts from the official IBKR NAV history and subtracts the P&L contribution
of the lines the user deselected — quantities replayed from the trade blotter,
prices from real daily history — so what remains is the actual account as it
would have been holding only the chosen names. Returns are then taken net of
deposits and withdrawals (time-weighted), because money paid in is not
performance. Books with no NAV history (hand-entered, never synced) have no real
curve to anchor on and fall back to a price-history simulation at today's
quantities, flagged basis "simulation" so it is never read as the real account.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session, selectinload

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


def _entry_trade(db: Session, portfolio_id: int, ticker: str) -> tuple[dt.date, float] | None:
    """Date and price of the first execution on a ticker (the opening trade)."""
    row = (
        db.query(models.Trade.trade_date, models.Trade.price)
        .filter(models.Trade.portfolio_id == portfolio_id, models.Trade.ticker == ticker)
        .order_by(models.Trade.trade_date, models.Trade.id)
        .first()
    )
    return (row[0], row[1]) if row else None


def _option_price_series_pinned(
    db: Session, portfolio_id: int, pos: models.Position, range_key: str
) -> dict[dt.date, float] | None:
    """Per-unit Black-76 price path for an option, with the vol pinned to BOTH
    the opening trade price and today's mark.

    A vol calibrated on today's price alone drifts badly at the far end of the
    window — it can value a now-worthless option at several times what was
    actually paid for it months earlier. Interpolating the vol linearly in time
    between the two observed prices forces the modelled path through both, so
    removing the line from the historical NAV introduces no jump at either end.
    That endpoint consistency is precisely what the NAV adjustment needs; the
    path in between is modelled, and reported as such.
    """
    if not (pos.opt_strike and pos.opt_expiry and pos.opt_right and pos.underlying_symbol):
        return None
    yahoo_und = options.yahoo_underlying(pos.underlying_symbol)
    if not yahoo_und:
        return None
    und = _daily_closes(yahoo_und, range_key)
    if not und:
        return None

    K, right, expiry = pos.opt_strike, pos.opt_right, pos.opt_expiry
    und_dates = sorted(und)
    last_d = und_dates[-1]

    def _t(d: dt.date) -> float:
        return max((expiry - d).days, 1) / 365.0

    sigma_now = options.implied_vol(pos.last_price, und[last_d], K, _t(last_d), RISK_FREE, right)

    sigma_entry = None
    entry = _entry_trade(db, portfolio_id, pos.ticker)
    entry_d = None
    if entry:
        entry_d, entry_price = entry
        f_entry = _price_on(und_dates, und, entry_d)
        if f_entry is not None and entry_price > 0:
            sigma_entry = options.implied_vol(entry_price, f_entry, K, _t(entry_d), RISK_FREE, right)

    if sigma_now is None and sigma_entry is None:
        return None
    if sigma_now is None:
        sigma_now = sigma_entry
    if sigma_entry is None or entry_d is None or entry_d >= last_d:
        sigma_entry, entry_d = sigma_now, und_dates[0]

    span = (last_d - entry_d).days or 1
    out: dict[dt.date, float] = {}
    for d in und_dates:
        t = (expiry - d).days / 365.0
        if t <= 0:
            continue
        w = min(1.0, max(0.0, (d - entry_d).days / span))
        sigma = sigma_entry + w * (sigma_now - sigma_entry)
        out[d] = options.black76(und[d], K, t, sigma, RISK_FREE, right)
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
    """Report on a selection of positions, anchored on the REAL account.

    The curve starts from the official IBKR NAV history and strips the P&L
    contribution of the lines the user deselected, so what remains is the real
    account as it would have been holding only the chosen names. Returns are
    then taken net of deposits/withdrawals (time-weighted): a book that doubled
    because money was paid in has not performed, and reading raw NAV changes as
    performance is what made the old figures wildly optimistic.

    Portfolios with no NAV history (hand-entered, never synced) have no real
    curve to anchor on and fall back to the price-history simulation, flagged
    as such.
    """
    rates = fx.get_rates(db)
    today = dt.date.today()
    cutoff = _cutoff(period, today)

    positions = (
        db.query(models.Position).filter(models.Position.id.in_(position_ids)).all()
        if position_ids else []
    )
    if not positions:
        return {
            "period": period, "currency": target_ccy, "basis": "real",
            "nav_series": [], "metrics": None, "included": [], "skipped": [],
            "modeled_removals": [],
        }

    selected_ids = {p.id for p in positions}
    portfolios = (
        db.query(models.Portfolio)
        .options(
            selectinload(models.Portfolio.positions),
            selectinload(models.Portfolio.nav_history),
        )
        .filter(models.Portfolio.id.in_({p.portfolio_id for p in positions}))
        .all()
    )

    # Current value of the selection, from live marks (used for the weights).
    included = [
        {
            "id": pos.id, "ticker": pos.ticker, "name": pos.name,
            "value": fx.convert(
                pos.quantity * pos.last_price * (pos.multiplier or 1.0),
                pos.currency, target_ccy, rates,
            ),
            "modeled": False,
        }
        for pos in positions
    ]
    total_value = sum(i["value"] for i in included)
    for i in included:
        i["weight"] = (i["value"] / total_value) if total_value else 0.0

    if not portfolios or not all(pf.nav_history for pf in portfolios):
        return _simulated_report(db, positions, period, target_ccy, rates)

    combined: dict[dt.date, float] = {}
    unadjustable: list[models.Position] = []
    modeled_removals: list[dict] = []
    for pf in portfolios:
        dropped = [p for p in pf.positions if p.id not in selected_ids]
        adj, missed = _excluded_pnl_by_date(
            db, pf, pf.base_currency, rates, {p.id for p in dropped}
        )
        unadjustable.extend(missed)
        missed_ids = {p.id for p in missed}
        modeled_removals.extend(
            {"ticker": p.ticker, "name": p.name}
            for p in dropped
            if p.id not in missed_ids and (p.asset_class in ("option", "future") or p.opt_right)
        )
        for h in pf.nav_history:
            if h.date < cutoff:
                continue
            nav_base = h.nav - adj.get(h.date, 0.0)
            combined[h.date] = combined.get(h.date, 0.0) + fx.convert(
                nav_base, pf.base_currency, target_ccy, rates
            )

    all_dates = sorted(combined)
    navs = [combined[d] for d in all_dates]
    if len(all_dates) < 3:
        return _simulated_report(db, positions, period, target_ccy, rates)

    clients = {pf.client for pf in portfolios if pf.client}
    rets = _flow_adjusted_returns(all_dates, navs, clients, rates, target_ccy)

    return {
        "period": period, "currency": target_ccy, "basis": "real",
        "nav_series": [
            {"date": d.isoformat(), "nav": round(v, 2)} for d, v in zip(all_dates, navs)
        ],
        "metrics": _metrics_from_returns(rets, navs),
        "included": sorted(included, key=lambda x: x["value"], reverse=True),
        "skipped": [
            {"id": p.id, "ticker": p.ticker, "name": p.name,
             "reason": "pas d'historique exploitable — laissée dans la courbe"}
            for p in unadjustable
        ],
        "modeled_removals": modeled_removals,
    }


def _flow_adjusted_returns(
    all_dates: list[dt.date], navs: list[float], clients, rates: dict, ccy: str,
) -> list[float]:
    """Daily time-weighted returns: r_i = NAV_i / (NAV_{i-1} + flows_i) − 1, so
    deposits and withdrawals move the NAV without ever counting as performance."""
    rets: list[float] = []
    for i in range(1, len(all_dates)):
        flows = sum(
            pnl._client_flows(
                c, rates, ccy,
                start=all_dates[i - 1] + dt.timedelta(days=1), end=all_dates[i],
            )
            for c in clients
        )
        denom = navs[i - 1] + flows
        if denom <= 0:
            continue
        rets.append(navs[i] / denom - 1.0)
    return rets


def _metrics_from_returns(rets: list[float], navs: list[float]) -> dict | None:
    """Risk/return metrics from time-weighted daily returns. Drawdown is measured
    on the compounded return index, not on raw NAV — a withdrawal is not a loss."""
    if len(rets) < 2:
        return None
    n = len(rets)
    growth = 1.0
    peak = 1.0
    max_dd = 0.0
    for r in rets:
        growth *= 1 + r
        peak = max(peak, growth)
        if peak > 0:
            max_dd = min(max_dd, growth / peak - 1.0)
    total_return = growth - 1.0
    ann_return = ((1 + total_return) ** (TRADING_DAYS / n) - 1) if total_return > -1 else -1.0

    mean = sum(rets) / n
    var = sum((r - mean) ** 2 for r in rets) / (n - 1)
    vol_daily = var ** 0.5
    rf_daily = RISK_FREE / TRADING_DAYS
    sharpe = ((mean - rf_daily) / vol_daily) * (TRADING_DAYS ** 0.5) if vol_daily > 0 else None
    downside = [r - rf_daily for r in rets if r < rf_daily]
    sortino = None
    if downside:
        dstd = (sum(d * d for d in downside) / len(downside)) ** 0.5
        if dstd > 0:
            sortino = ((mean - rf_daily) / dstd) * (TRADING_DAYS ** 0.5)

    return {
        "start_nav": round(navs[0], 2),
        "end_nav": round(navs[-1], 2),
        "total_return": total_return,
        "annualised_return": ann_return,
        "annualised_vol": vol_daily * (TRADING_DAYS ** 0.5),
        "sharpe": sharpe,
        "sortino": sortino,
        "max_drawdown": max_dd,
        "best_day": max(rets),
        "worst_day": min(rets),
        "observations": len(navs),
    }


def _simulated_report(
    db: Session,
    positions: list[models.Position],
    period: str,
    target_ccy: str,
    rates: dict,
) -> dict:
    """Fallback for books with no real NAV history: simulate each line's value
    from its price history at TODAY'S quantities. Answers "how would what I hold
    now have behaved", not "what did this account do" — flagged basis
    "simulation" so the UI never presents it as the real account."""
    range_key = PERIOD_RANGES.get(period, "1y")
    today = dt.date.today()
    cutoff = _cutoff(period, today)

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
            "period": period, "currency": target_ccy, "basis": "simulation",
            "nav_series": [], "metrics": None,
            "included": included, "skipped": skipped, "modeled_removals": [],
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

    # No cash flows to strip here: the series is a pure price-driven simulation
    # of a fixed holding, so its NAV changes ARE its returns.
    scaled = [p["nav"] for p in nav_series]
    rets = [scaled[i] / scaled[i - 1] - 1.0 for i in range(1, len(scaled)) if scaled[i - 1] > 0]

    return {
        "period": period, "currency": target_ccy, "basis": "simulation",
        "nav_series": nav_series, "metrics": _metrics_from_returns(rets, scaled),
        "included": sorted(included, key=lambda x: x["value"], reverse=True),
        "skipped": skipped, "modeled_removals": [],
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


def _portfolio_has_trades(db: Session, portfolio_id: int) -> bool:
    return (
        db.query(models.Trade.id)
        .filter(models.Trade.portfolio_id == portfolio_id)
        .first()
        is not None
    )


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


def _position_pnl_series(
    db: Session, portfolio: models.Portfolio, pos: models.Position,
    nav_dates: list[dt.date], base_ccy: str, rates: dict,
) -> dict[dt.date, float] | None:
    """Unrealised P&L of ONE position on each NAV date, in the portfolio's base
    currency — the amount to strip from the official NAV to drop that line.

    Quantities come from the trade blotter (0 before the opening trade), prices
    from the real daily history; options are priced with the endpoint-pinned
    Black-76 path. None when the line can't be valued historically at all, so
    the caller can report it rather than silently leaving the curve untouched.
    """
    steps = _cum_qty_steps(db, portfolio.id, pos.ticker)
    if not steps and _portfolio_has_trades(db, portfolio.id):
        # The blotter covers this book but not this line, so there is no honest
        # way to date the opening. Assuming it was held for the whole window
        # would back-date the P&L to before the position existed and wreck the
        # early NAV — report it instead of guessing.
        return None

    if pos.asset_class in ("option", "future") or pos.opt_right:
        prices = _option_price_series_pinned(db, portfolio.id, pos, "5y")
    else:
        symbol = pos.data_symbol or pos.ticker
        prices = _daily_closes(symbol, "5y") if symbol else {}
    if not prices:
        return None

    sorted_pd = sorted(prices)
    mult = pos.multiplier or 1.0
    fx1 = fx.convert(1.0, pos.currency, base_ccy, rates)
    out: dict[dt.date, float] = {}
    for d in nav_dates:
        qty = _qty_on(steps, d, pos.quantity)
        price = _price_on(sorted_pd, prices, d) if qty else None
        out[d] = qty * (price - pos.avg_cost) * mult * fx1 if price is not None else 0.0
    return out


def _excluded_pnl_by_date(
    db: Session, portfolio: models.Portfolio, base_ccy: str, rates: dict, position_ids: set[int]
) -> tuple[dict[dt.date, float], list[models.Position]]:
    """Total unrealised P&L (portfolio base ccy) of `position_ids` on every date
    the NAV history covers, plus the positions that could NOT be valued
    historically (left in the curve, and reported to the caller)."""
    targets = [p for p in portfolio.positions if p.id in position_ids]
    nav_dates = sorted({h.date for h in portfolio.nav_history})
    out: dict[dt.date, float] = {d: 0.0 for d in nav_dates}
    unadjustable: list[models.Position] = []
    if not targets or not nav_dates:
        return out, unadjustable
    for pos in targets:
        series = _position_pnl_series(db, portfolio, pos, nav_dates, base_ccy, rates)
        if series is None:
            unadjustable.append(pos)
            continue
        for d, v in series.items():
            out[d] += v
    return out, unadjustable


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
    unadjustable: list[models.Position] = []
    for pf in client.portfolios:
        adj_pnl, missed = _excluded_pnl_by_date(db, pf, pf.base_currency, rates, excluded_ids)
        unadjustable.extend(missed)
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
        # Adjusted NAV at (or last before) 1 Jan — the YTD P&L baseline must come
        # from the SAME adjusted curve as the current NAV, otherwise the two ends
        # of the subtraction disagree about which lines the book holds.
        "nav_at_year_start": _at_or_before(all_dates, combined_navs, year_start),
        "twr_ytd": _twr_from_combined(all_dates, combined_navs, client, rates, target_ccy, year_start),
        "twr_since_inception": _twr_from_combined(all_dates, combined_navs, client, rates, target_ccy, None),
        "unadjustable": [
            {"id": p.id, "ticker": p.ticker, "name": p.name} for p in unadjustable
        ],
    }


def _at_or_before(dates: list[dt.date], values: list[float], target: dt.date) -> float | None:
    """Value on `target`, or the last one before it (0.0 if the series starts
    after — the book did not exist yet). None when there is no series."""
    if not dates:
        return None
    if target < dates[0]:
        return 0.0
    import bisect
    i = bisect.bisect_right(dates, target) - 1
    return values[i] if i >= 0 else 0.0
