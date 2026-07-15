import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/market", tags=["market"])


# ---------------- Watchlist ----------------
class WatchlistItemIn(BaseModel):
    ticker: str
    name: str
    asset_class: str = "equity"
    currency: str = "USD"
    last_price: float
    day_change_pct: float = 0.0
    target_price: float | None = None
    added_by_id: int | None = None
    notes: str = ""
    tags: str = ""


@router.get("/watchlist", response_model=list[schemas.WatchlistItemOut])
def list_watchlist(db: Session = Depends(get_db)):
    return (
        db.query(models.WatchlistItem)
        .options(joinedload(models.WatchlistItem.added_by))
        .order_by(models.WatchlistItem.ticker)
        .all()
    )


@router.post("/watchlist", response_model=schemas.WatchlistItemOut)
def add_watchlist_item(body: WatchlistItemIn, db: Session = Depends(get_db)):
    item = models.WatchlistItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/watchlist/{item_id}")
def delete_watchlist_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(models.WatchlistItem).filter(models.WatchlistItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


# ---------------- News ----------------
@router.get("/news", response_model=list[schemas.NewsItemOut])
def list_news(limit: int = Query(30, le=100), db: Session = Depends(get_db)):
    return (
        db.query(models.NewsItem)
        .order_by(models.NewsItem.published_at.desc())
        .limit(limit)
        .all()
    )


# ---------------- Earnings ----------------
class EarningsAlertUpdate(BaseModel):
    alert_enabled: bool


@router.get("/earnings", response_model=list[schemas.EarningsEventOut])
def list_earnings(
    upcoming_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    q = db.query(models.EarningsEvent)
    if upcoming_only:
        q = q.filter(models.EarningsEvent.event_date >= dt.date.today())
    return q.order_by(models.EarningsEvent.event_date).all()


@router.patch("/earnings/{event_id}", response_model=schemas.EarningsEventOut)
def update_earnings_alert(event_id: int, body: EarningsAlertUpdate, db: Session = Depends(get_db)):
    event = db.query(models.EarningsEvent).filter(models.EarningsEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    event.alert_enabled = body.alert_enabled
    db.commit()
    db.refresh(event)
    return event
