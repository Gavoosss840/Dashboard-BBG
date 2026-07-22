from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import fx_rates, target_currency  # noqa: F401 (target_currency used via Depends)
from app.services import reports

router = APIRouter(prefix="/api/reports", tags=["reports"])


class ReportRequest(BaseModel):
    position_ids: list[int]
    period: str = "1y"  # 1mo | 3mo | 6mo | ytd | 1y | 5y | max


@router.post("/portfolio")
def portfolio_report(
    payload: ReportRequest,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
):
    """Analytics (NAV, return, vol, Sharpe, Sortino, max drawdown) simulated on
    the selected positions only, from their real daily price history."""
    return reports.build_report(db, payload.position_ids, payload.period, ccy)
