from fastapi import Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import fx


def target_currency(ccy: str = Query("EUR")) -> str:
    ccy = ccy.upper()
    if ccy not in fx.SUPPORTED_CURRENCIES:
        raise HTTPException(status_code=400, detail=f"Unsupported currency: {ccy}")
    return ccy


def fx_rates(db: Session = Depends(get_db)) -> dict[str, float]:
    rates = fx.get_rates(db)
    if not rates:
        raise HTTPException(status_code=500, detail="FX rates not seeded")
    return rates
