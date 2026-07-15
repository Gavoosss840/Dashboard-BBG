from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/mandates", tags=["mandates"])


@router.get("", response_model=list[schemas.MandateOut])
def list_mandates(db: Session = Depends(get_db)):
    mandates = (
        db.query(models.Mandate)
        .options(joinedload(models.Mandate.client))
        .order_by(models.Mandate.signing_date.desc())
        .all()
    )
    out = []
    for m in mandates:
        item = schemas.MandateOut.model_validate(m)
        item.client_name = m.client.name
        out.append(item)
    return out
