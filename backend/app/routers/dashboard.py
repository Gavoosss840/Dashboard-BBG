import bisect
from collections import defaultdict

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.utils import business_days_between, today
from app.services import fx, pnl

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _combined_nav_history(portfolios: list[models.Portfolio], rates: dict, ccy: str) -> list[schemas.NavPointOut]:
    series_by_portfolio = []
    earliest = today()
    for p in portfolios:
        rows = sorted(p.nav_history, key=lambda n: n.date)
        if not rows:
            continue
        dates = [r.date for r in rows]
        navs = [fx.convert(r.nav, p.base_currency, ccy, rates) for r in rows]
        series_by_portfolio.append((dates, navs))
        earliest = min(earliest, dates[0])

    all_days = business_days_between(earliest, today())
    sampled_days = all_days[::5] if len(all_days) > 5 else all_days
    if sampled_days and sampled_days[-1] != today():
        sampled_days.append(today())

    points = []
    for day in sampled_days:
        total = 0.0
        for dates, navs in series_by_portfolio:
            idx = bisect.bisect_right(dates, day) - 1
            if idx >= 0:
                total += navs[idx]
        points.append(schemas.NavPointOut(date=day, nav=round(total, 2)))
    return points


@router.get("", response_model=schemas.DashboardOut)
def get_dashboard(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    clients = (
        db.query(models.Client)
        .options(
            # selectinload, not joinedload — same cartesian-product risk as
            # clients.py._client_query for a client with a large IBKR book.
            selectinload(models.Client.portfolios).selectinload(models.Portfolio.positions),
            selectinload(models.Client.portfolios).selectinload(models.Portfolio.nav_history),
            selectinload(models.Client.cash_flows),
        )
        .all()
    )
    all_portfolios = [p for c in clients for p in c.portfolios]

    total_aum = 0.0
    pnl_ytd = 0.0
    pnl_since_inception = 0.0
    aum_by_bucket: dict[str, float] = defaultdict(float)
    aum_by_asset_class: dict[str, float] = defaultdict(float)
    summaries = []

    for c in clients:
        agg = pnl.client_aggregate(c, rates, ccy, today())
        total_aum += agg["current_nav"]
        pnl_ytd += agg["pnl_ytd"]
        pnl_since_inception += agg["pnl_since_inception"]
        summary = schemas.ClientSummaryOut.model_validate(c)
        summary.net_deposits = agg["net_deposits"]
        summary.current_nav = agg["current_nav"]
        summary.pnl_ytd = agg["pnl_ytd"]
        summary.pnl_since_inception = agg["pnl_since_inception"]
        summaries.append(summary)
        for p in c.portfolios:
            # Gross exposure (sum of |market value|), not net: a long/short
            # portfolio nets longs against shorts to a figure that can be
            # negative or near-zero even on a heavily deployed book, which
            # makes a net breakdown chart show a nonsensical single bucket at
            # "100%" of a negative total. Gross reflects capital actually at
            # work in each bucket/asset class regardless of direction.
            for pos in p.positions:
                exposure = abs(pnl.position_market_value(pos, rates, ccy))
                aum_by_bucket[p.strategy_bucket] += exposure
                aum_by_asset_class[pos.asset_class] += exposure

    num_active_mandates = (
        db.query(models.Mandate).filter(models.Mandate.status == "active").count()
    )
    pending_fees = sum(
        fx.convert(t.amount, t.currency, ccy, rates)
        for t in db.query(models.Transaction).filter(models.Transaction.status.in_(["draft", "invoiced", "pending"])).all()
    )
    upcoming_earnings = (
        db.query(models.EarningsEvent).filter(models.EarningsEvent.event_date >= today()).count()
    )
    open_crm_leads = (
        db.query(models.CrmContact)
        .filter(models.CrmContact.stage.notin_(["onboarded", "lost"]))
        .count()
    )

    top_clients = sorted(summaries, key=lambda s: s.current_nav, reverse=True)[:5]

    return schemas.DashboardOut(
        as_of=today(),
        total_aum=total_aum,
        currency=ccy,
        num_clients=len(clients),
        num_active_mandates=num_active_mandates,
        pnl_ytd=pnl_ytd,
        pnl_since_inception=pnl_since_inception,
        aum_by_bucket=dict(aum_by_bucket),
        aum_by_asset_class=dict(aum_by_asset_class),
        top_clients=top_clients,
        nav_history=_combined_nav_history(all_portfolios, rates, ccy),
        pending_fees=pending_fees,
        upcoming_earnings=upcoming_earnings,
        open_crm_leads=open_crm_leads,
    )
