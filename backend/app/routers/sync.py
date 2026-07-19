from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import backup, ibkr, market_data

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _last_log(db: Session, kind: str) -> models.SyncLog | None:
    return (
        db.query(models.SyncLog)
        .filter(models.SyncLog.kind == kind)
        .order_by(models.SyncLog.started_at.desc())
        .first()
    )


@router.get("/status", response_model=schemas.SyncStatusOut)
def sync_status(db: Session = Depends(get_db)):
    return schemas.SyncStatusOut(
        ibkr_configured=ibkr.is_configured(),
        last_ibkr_sync=_last_log(db, "ibkr"),
        last_market_refresh=_last_log(db, "market_data"),
        last_backup=_last_log(db, "backup"),
    )


@router.post("/ibkr", response_model=schemas.SyncLogOut)
def trigger_ibkr_sync(db: Session = Depends(get_db)):
    return ibkr.run_sync(db)


@router.post("/market-data", response_model=schemas.SyncLogOut)
def trigger_market_refresh(db: Session = Depends(get_db)):
    return market_data.refresh_market_data(db)


@router.post("/backup", response_model=schemas.SyncLogOut)
def trigger_backup(db: Session = Depends(get_db)):
    return backup.run_backup(db)
