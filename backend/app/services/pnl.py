import datetime as dt

from app import models
from app.services import fx


# ---------- Position / portfolio building blocks ----------

def position_market_value(pos: models.Position, rates: dict, target_ccy: str) -> float:
    mv = pos.quantity * pos.last_price * (pos.multiplier or 1.0)
    return fx.convert(mv, pos.currency, target_ccy, rates)


def position_unrealized_pnl(pos: models.Position, rates: dict, target_ccy: str) -> float:
    pnl = (pos.last_price - pos.avg_cost) * pos.quantity * (pos.multiplier or 1.0)
    return fx.convert(pnl, pos.currency, target_ccy, rates)


def position_cost_basis(pos: models.Position, rates: dict, target_ccy: str) -> float:
    """What the line cost — i.e. the cash it consumed when it was opened."""
    cb = pos.avg_cost * pos.quantity * (pos.multiplier or 1.0)
    return fx.convert(cb, pos.currency, target_ccy, rates)


def portfolio_market_value(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    """Book value used for NAV, with excluded lines read "as if never held".

    Dropping an excluded line outright would silently destroy the capital that
    bought it: the market value disappears but the cash that paid for it never
    comes back, so NAV falls by the whole position instead of by its P&L. The
    honest counterfactual is that the money stayed in cash, so an excluded line
    contributes its COST BASIS. That makes

        adjusted NAV = official NAV − unrealised P&L of the excluded lines

    which is exactly the adjustment the historical curve applies in
    reports._excluded_pnl_by_date — current and historical figures now agree.
    """
    total = 0.0
    for p in portfolio.positions:
        total += (
            position_cost_basis(p, rates, target_ccy)
            if p.excluded
            else position_market_value(p, rates, target_ccy)
        )
    return total


def portfolio_unrealized_pnl(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    return sum(
        position_unrealized_pnl(p, rates, target_ccy)
        for p in portfolio.positions if not p.excluded
    )


def portfolio_cash(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    return sum(fx.convert(cb.amount, cb.currency, target_ccy, rates) for cb in portfolio.cash_balances)


# ---------- NAV ----------

def _nav_at_or_before(portfolio: models.Portfolio, target_date: dt.date) -> float | None:
    """NAV from history at (or last before) target_date.

    Returns 0.0 when the portfolio's history starts after target_date (it did
    not exist yet), None when there is no history at all.
    """
    entries = sorted(portfolio.nav_history, key=lambda n: n.date)
    if not entries:
        return None
    if target_date < entries[0].date:
        return 0.0
    val = entries[0].nav
    for entry in entries:
        if entry.date <= target_date:
            val = entry.nav
        else:
            break
    return val


def portfolio_current_nav(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    """Live NAV = cash + market value of positions.

    This is the current view (positions carry the custodian's marks after an
    IBKR sync, refreshed by the market-data job in between). Portfolios with
    neither positions nor cash fall back to their NAV history, then to the
    inception NAV — so a freshly created shell still shows something sensible.
    """
    if portfolio.positions or portfolio.cash_balances:
        return portfolio_market_value(portfolio, rates, target_ccy) + portfolio_cash(portfolio, rates, target_ccy)
    hist_nav = _nav_at_or_before(portfolio, dt.date.max)
    if hist_nav is not None:
        return fx.convert(hist_nav, portfolio.base_currency, target_ccy, rates)
    return fx.convert(portfolio.inception_nav, portfolio.base_currency, target_ccy, rates)


def portfolio_nav_at(portfolio: models.Portfolio, rates: dict, target_ccy: str, at: dt.date) -> float:
    hist = _nav_at_or_before(portfolio, at)
    if hist is not None:
        return fx.convert(hist, portfolio.base_currency, target_ccy, rates)
    # No history: the best available approximation is the inception NAV.
    return fx.convert(portfolio.inception_nav, portfolio.base_currency, target_ccy, rates)


def client_current_nav(client: models.Client, rates: dict, target_ccy: str) -> float:
    return sum(portfolio_current_nav(p, rates, target_ccy) for p in client.portfolios)


def client_nav_at(client: models.Client, rates: dict, target_ccy: str, at: dt.date) -> float:
    return sum(portfolio_nav_at(p, rates, target_ccy, at) for p in client.portfolios)


# ---------- Flows ----------

def _client_flows(client: models.Client, rates: dict, target_ccy: str,
                  start: dt.date | None = None, end: dt.date | None = None) -> float:
    """Net deposits (deposits − withdrawals) over [start, end], converted."""
    total = 0.0
    for cf in client.cash_flows:
        if start is not None and cf.date < start:
            continue
        if end is not None and cf.date > end:
            continue
        amount = fx.convert(cf.amount, cf.currency, target_ccy, rates)
        total += amount if cf.flow_type == "deposit" else -amount
    return total


# ---------- TWR (time-weighted return) ----------

def client_twr(client: models.Client, rates: dict, target_ccy: str,
               start_date: dt.date | None = None) -> float | None:
    """Chain-linked TWR from the combined NAV history and client cash flows.

    Flows are assumed to land at the start of each sub-period:
        r_i = nav_i / (nav_{i-1} + flows_(prev, i]) − 1
    Returns None when there aren't at least two NAV points to work with.
    """
    points: dict[dt.date, float] = {}
    per_portfolio: list[tuple[list[dt.date], list[float]]] = []
    for p in client.portfolios:
        entries = sorted(p.nav_history, key=lambda n: n.date)
        if not entries:
            continue
        dates = [e.date for e in entries]
        navs = [fx.convert(e.nav, p.base_currency, target_ccy, rates) for e in entries]
        per_portfolio.append((dates, navs))
        for d in dates:
            points[d] = 0.0
    if not points:
        return None

    all_dates = sorted(points.keys())
    if start_date is not None:
        prior = [d for d in all_dates if d <= start_date]
        first = prior[-1] if prior else all_dates[0]
        all_dates = [d for d in all_dates if d >= first]
    if len(all_dates) < 2:
        return None

    import bisect
    combined: list[float] = []
    for d in all_dates:
        total = 0.0
        for dates, navs in per_portfolio:
            idx = bisect.bisect_right(dates, d) - 1
            if idx >= 0:
                total += navs[idx]
        combined.append(total)

    twr = 1.0
    for i in range(1, len(all_dates)):
        flows = _client_flows(client, rates, target_ccy,
                              start=all_dates[i - 1] + dt.timedelta(days=1), end=all_dates[i])
        denom = combined[i - 1] + flows
        if denom <= 0:
            continue
        twr *= combined[i] / denom
    return twr - 1.0


# ---------- Money-weighted return (IRR) ----------

def money_weighted_return(
    client: models.Client, rates: dict, target_ccy: str, as_of: dt.date, current_nav: float,
) -> float | None:
    """Annualised IRR over the client's actual cash flows, ending on today's NAV.

    Complements the TWR: the TWR deliberately neutralises WHEN money arrived, so
    it measures the strategy. This measures the investor's own outcome — capital
    that sat in the book for two months counts for two months, not for a year.
    The two diverge whenever contributions are staggered, and both are correct.

    None when there are no flows or no sign change (an IRR needs both).
    """
    flows = [
        (
            cf.date,
            -_flow_in_ccy(cf, rates, target_ccy) if cf.flow_type == "deposit"
            else _flow_in_ccy(cf, rates, target_ccy),
        )
        for cf in client.cash_flows
        if cf.date <= as_of
    ]
    if not flows:
        return None
    flows.sort(key=lambda x: x[0])
    flows.append((as_of, current_nav))
    if not (any(a < 0 for _, a in flows) and any(a > 0 for _, a in flows)):
        return None

    t0 = flows[0][0]
    span = (as_of - t0).days
    if span < 30:  # too short to annualise into anything meaningful
        return None

    def npv(rate: float) -> float:
        return sum(a / (1 + rate) ** ((d - t0).days / 365.0) for d, a in flows)

    lo, hi = -0.95, 10.0
    if npv(lo) * npv(hi) > 0:
        return None
    for _ in range(200):
        mid = (lo + hi) / 2
        if npv(mid) > 0:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _flow_in_ccy(cf: models.CashFlow, rates: dict, target_ccy: str) -> float:
    return fx.convert(cf.amount, cf.currency, target_ccy, rates)


# ---------- Aggregates ----------

def client_aggregate(client: models.Client, rates: dict, target_ccy: str, as_of: dt.date) -> dict:
    current_nav = client_current_nav(client, rates, target_ccy)

    total_deposits = sum(
        fx.convert(cf.amount, cf.currency, target_ccy, rates)
        for cf in client.cash_flows if cf.flow_type == "deposit"
    )
    total_withdrawals = sum(
        fx.convert(cf.amount, cf.currency, target_ccy, rates)
        for cf in client.cash_flows if cf.flow_type == "withdrawal"
    )
    net_deposits = total_deposits - total_withdrawals

    # Since inception: NAV minus what the client actually put in. When no
    # cash flow was ever recorded, fall back to the portfolios' inception NAVs
    # so a hand-entered client doesn't show their whole NAV as "profit".
    if client.cash_flows:
        contributions = net_deposits
    else:
        contributions = sum(
            fx.convert(p.inception_nav, p.base_currency, target_ccy, rates)
            for p in client.portfolios
        )
    pnl_since_inception = current_nav - contributions

    # YTD: NAV change since Jan 1, net of the flows that happened this year.
    year_start = dt.date(as_of.year, 1, 1)
    nav_year_start = client_nav_at(client, rates, target_ccy, year_start)
    flows_ytd = _client_flows(client, rates, target_ccy,
                              start=year_start + dt.timedelta(days=1), end=as_of)
    pnl_ytd = current_nav - nav_year_start - flows_ytd

    return {
        "current_nav": current_nav,
        "pnl_ytd": pnl_ytd,
        "pnl_since_inception": pnl_since_inception,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "net_deposits": net_deposits,
        "twr_ytd": client_twr(client, rates, target_ccy, start_date=year_start),
        "twr_since_inception": client_twr(client, rates, target_ccy),
    }


# Portfolio-level P&L (used on the client detail page, per portfolio)

def portfolio_pnl_since_inception(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    current = portfolio_current_nav(portfolio, rates, target_ccy)
    inception = fx.convert(portfolio.inception_nav, portfolio.base_currency, target_ccy, rates)
    return current - inception


def portfolio_pnl_ytd(portfolio: models.Portfolio, rates: dict, target_ccy: str, as_of: dt.date) -> float:
    current = portfolio_current_nav(portfolio, rates, target_ccy)
    return current - portfolio_nav_at(portfolio, rates, target_ccy, dt.date(as_of.year, 1, 1))


def total_aum(clients: list[models.Client], rates: dict, target_ccy: str) -> float:
    return sum(portfolio_current_nav(p, rates, target_ccy) for c in clients for p in c.portfolios)
