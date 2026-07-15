from sqlalchemy.orm import Session

from app import models

SUPPORTED_CURRENCIES = ["USD", "EUR", "CHF", "HKD", "JPY", "GBP", "AED"]


def get_rates(db: Session) -> dict[str, float]:
    rows = db.query(models.FXRate).all()
    return {r.ccy: r.rate_vs_usd for r in rows}


def convert(amount: float, from_ccy: str, to_ccy: str, rates: dict[str, float]) -> float:
    """rates are expressed as units of CCY per 1 USD (USD pivot)."""
    if from_ccy == to_ccy:
        return amount
    from_rate = rates.get(from_ccy, 1.0)
    to_rate = rates.get(to_ccy, 1.0)
    usd_amount = amount / from_rate
    return usd_amount * to_rate
