import datetime as dt

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.utils import today
from app.services import pnl, risk_parity

router = APIRouter(prefix="/api/allocation", tags=["allocation"])

# Portfolios flagged "mixed" straddle both books; for AUM attribution purposes
# (not for P&L) we split them evenly between the two pure buckets.
BUCKET_KEY_BY_NAME = {
    "Stock Picking": "stock_picking",
    "Arbitrage Algorithmique": "algo_arbitrage",
}


@router.get("", response_model=schemas.AllocationResultOut)
def get_allocation(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    buckets = db.query(models.AllocationBucket).order_by(models.AllocationBucket.id).all()
    portfolios = db.query(models.Portfolio).all()

    aum_by_key: dict[str, float] = {key: 0.0 for key in BUCKET_KEY_BY_NAME.values()}
    for p in portfolios:
        mv = pnl.portfolio_market_value(p, rates, ccy)
        if p.strategy_bucket == "mixed":
            for key in aum_by_key:
                aum_by_key[key] += mv / len(aum_by_key)
        elif p.strategy_bucket in aum_by_key:
            aum_by_key[p.strategy_bucket] += mv

    returns_by_bucket = []
    vols = []
    for b in buckets:
        cutoff = today() - dt.timedelta(days=b.lookback_days)
        rows = (
            db.query(models.AllocationReturn)
            .filter(models.AllocationReturn.bucket_id == b.id, models.AllocationReturn.date >= cutoff)
            .order_by(models.AllocationReturn.date)
            .all()
        )
        series = [r.daily_return_pct for r in rows]
        returns_by_bucket.append(series)
        vols.append(risk_parity.annualized_vol(series))

    min_len = min((len(s) for s in returns_by_bucket), default=0)
    if min_len >= 2 and len(buckets) >= 1:
        aligned = [s[-min_len:] for s in returns_by_bucket]
        cov = risk_parity.covariance_matrix(aligned)
        weights = risk_parity.erc_weights(cov)
    else:
        weights = [1.0 / len(buckets)] * len(buckets) if buckets else []

    total_aum = sum(aum_by_key.values())
    bucket_outs = []
    for b, vol, w in zip(buckets, vols, weights):
        key = BUCKET_KEY_BY_NAME.get(b.name, "")
        aum = aum_by_key.get(key, 0.0)
        current_weight = (aum / total_aum * 100) if total_aum else 0.0
        target_weight = w * 100
        out = schemas.AllocationBucketOut.model_validate(b)
        out.aum = aum
        out.currency = ccy
        out.realized_vol_annualized = vol * 100
        out.current_weight_pct = current_weight
        out.target_weight_pct = target_weight
        out.rebalance_delta_pct = target_weight - current_weight
        bucket_outs.append(out)

    return schemas.AllocationResultOut(
        buckets=bucket_outs,
        total_aum=total_aum,
        method="Risk Parity pur (Equal Risk Contribution, vol réalisée 60j)",
        as_of=today(),
    )
