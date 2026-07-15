import datetime as dt

from app import models
from app.services import fx


def position_market_value(pos: models.Position, rates: dict, target_ccy: str) -> float:
    mv = pos.quantity * pos.last_price
    return fx.convert(mv, pos.currency, target_ccy, rates)


def position_unrealized_pnl(pos: models.Position, rates: dict, target_ccy: str) -> float:
    pnl = (pos.last_price - pos.avg_cost) * pos.quantity
    return fx.convert(pnl, pos.currency, target_ccy, rates)


def portfolio_market_value(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    return sum(position_market_value(p, rates, target_ccy) for p in portfolio.positions)


def portfolio_unrealized_pnl(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    return sum(position_unrealized_pnl(p, rates, target_ccy) for p in portfolio.positions)


def _nav_at_or_before(portfolio: models.Portfolio, target_date: dt.date) -> float:
    entries = sorted(portfolio.nav_history, key=lambda n: n.date)
    val = None
    for entry in entries:
        if entry.date <= target_date:
            val = entry.nav
        else:
            break
    if val is None and entries:
        val = entries[0].nav
    if val is None:
        val = portfolio.inception_nav
    return val


def portfolio_current_nav(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    if portfolio.nav_history:
        latest = max(portfolio.nav_history, key=lambda n: n.date)
        nav = latest.nav
    else:
        nav = portfolio.inception_nav
    return fx.convert(nav, portfolio.base_currency, target_ccy, rates)


def portfolio_pnl_since_inception(portfolio: models.Portfolio, rates: dict, target_ccy: str) -> float:
    current = portfolio_current_nav(portfolio, rates, target_ccy)
    inception = fx.convert(portfolio.inception_nav, portfolio.base_currency, target_ccy, rates)
    return current - inception


def portfolio_pnl_ytd(
    portfolio: models.Portfolio, rates: dict, target_ccy: str, as_of: dt.date
) -> float:
    current = portfolio_current_nav(portfolio, rates, target_ccy)
    year_start = dt.date(as_of.year, 1, 1)
    start_nav = fx.convert(
        _nav_at_or_before(portfolio, year_start), portfolio.base_currency, target_ccy, rates
    )
    return current - start_nav


def client_aggregate(client: models.Client, rates: dict, target_ccy: str, as_of: dt.date) -> dict:
    current_nav = sum(
        portfolio_current_nav(p, rates, target_ccy) for p in client.portfolios
    )
    pnl_ytd = sum(
        portfolio_pnl_ytd(p, rates, target_ccy, as_of) for p in client.portfolios
    )
    pnl_since_inception = sum(
        portfolio_pnl_since_inception(p, rates, target_ccy) for p in client.portfolios
    )
    total_deposits = sum(
        fx.convert(cf.amount, cf.currency, target_ccy, rates)
        for cf in client.cash_flows
        if cf.flow_type == "deposit"
    )
    total_withdrawals = sum(
        fx.convert(cf.amount, cf.currency, target_ccy, rates)
        for cf in client.cash_flows
        if cf.flow_type == "withdrawal"
    )
    return {
        "current_nav": current_nav,
        "pnl_ytd": pnl_ytd,
        "pnl_since_inception": pnl_since_inception,
        "total_deposits": total_deposits,
        "total_withdrawals": total_withdrawals,
        "net_deposits": total_deposits - total_withdrawals,
    }
