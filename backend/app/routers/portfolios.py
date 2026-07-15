from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.utils import AS_OF
from app.services import pnl

router = APIRouter(prefix="/api/portfolios", tags=["portfolios"])


@router.get("/global", response_model=schemas.GlobalPortfolioOut)
def global_portfolio(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    portfolios = (
        db.query(models.Portfolio)
        .options(joinedload(models.Portfolio.positions), joinedload(models.Portfolio.client))
        .all()
    )

    by_asset_class: dict[str, float] = defaultdict(float)
    by_sector: dict[str, float] = defaultdict(float)
    by_region: dict[str, float] = defaultdict(float)
    by_currency: dict[str, float] = defaultdict(float)
    by_bucket: dict[str, float] = defaultdict(float)
    by_client: dict[str, float] = defaultdict(float)
    holdings: dict[str, dict] = {}

    total_mv = 0.0
    total_pnl = 0.0

    for p in portfolios:
        client_name = p.client.name if p.client else "?"
        for pos in p.positions:
            mv = pnl.position_market_value(pos, rates, ccy)
            upnl = pnl.position_unrealized_pnl(pos, rates, ccy)
            total_mv += mv
            total_pnl += upnl
            by_asset_class[pos.asset_class] += mv
            by_sector[pos.sector or "N/A"] += mv
            by_region[pos.region or "N/A"] += mv
            by_currency[pos.currency] += mv
            by_bucket[p.strategy_bucket] += mv
            by_client[client_name] += mv
            key = pos.ticker
            if key not in holdings:
                holdings[key] = {"ticker": pos.ticker, "name": pos.name, "asset_class": pos.asset_class, "market_value": 0.0}
            holdings[key]["market_value"] += mv

    holding_list = [
        schemas.AggregatedHoldingOut(
            ticker=h["ticker"], name=h["name"], asset_class=h["asset_class"],
            market_value=h["market_value"],
            weight_pct=(h["market_value"] / total_mv * 100) if total_mv else 0.0,
        )
        for h in sorted(holdings.values(), key=lambda x: x["market_value"], reverse=True)
    ]

    return schemas.GlobalPortfolioOut(
        as_of=AS_OF,
        currency=ccy,
        total_market_value=total_mv,
        total_unrealized_pnl=total_pnl,
        by_asset_class=dict(by_asset_class),
        by_sector=dict(by_sector),
        by_region=dict(by_region),
        by_currency=dict(by_currency),
        by_strategy_bucket=dict(by_bucket),
        by_client=dict(by_client),
        holdings=holding_list,
    )


@router.get("/{portfolio_id}", response_model=schemas.PortfolioOut)
def get_portfolio(
    portfolio_id: int,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    portfolio = (
        db.query(models.Portfolio)
        .options(joinedload(models.Portfolio.positions), joinedload(models.Portfolio.nav_history))
        .filter(models.Portfolio.id == portfolio_id)
        .first()
    )
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    out = schemas.PortfolioOut.model_validate(portfolio)
    out.market_value = pnl.portfolio_market_value(portfolio, rates, ccy)
    out.unrealized_pnl = pnl.portfolio_unrealized_pnl(portfolio, rates, ccy)
    out.realized_pnl_ytd = pnl.portfolio_pnl_ytd(portfolio, rates, ccy, AS_OF)
    out.realized_pnl_since_inception = pnl.portfolio_pnl_since_inception(portfolio, rates, ccy)
    positions_out = []
    for pos in portfolio.positions:
        pos_out = schemas.PositionOut.model_validate(pos)
        pos_out.market_value = pnl.position_market_value(pos, rates, ccy)
        pos_out.unrealized_pnl = pnl.position_unrealized_pnl(pos, rates, ccy)
        positions_out.append(pos_out)
    out.positions = positions_out
    return out
