from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/reference", tags=["reference"])


@router.get("", response_model=list[schemas.ReferenceEntryOut])
def list_reference(category: str | None = Query(None), db: Session = Depends(get_db)):
    q = db.query(models.ReferenceEntry)
    if category:
        q = q.filter(models.ReferenceEntry.category == category)
    return q.order_by(models.ReferenceEntry.category, models.ReferenceEntry.title).all()
