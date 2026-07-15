from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services.fx import SUPPORTED_CURRENCIES

router = APIRouter(prefix="/api/fx", tags=["fx"])


@router.get("/rates", response_model=list[schemas.FXRateOut])
def list_rates(db: Session = Depends(get_db)):
    return db.query(models.FXRate).all()


@router.get("/currencies", response_model=list[str])
def list_currencies():
    return SUPPORTED_CURRENCIES
