from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/mandates", tags=["mandates"])


def _to_out(m: models.Mandate) -> schemas.MandateOut:
    item = schemas.MandateOut.model_validate(m)
    item.client_name = m.client.name
    return item


@router.get("", response_model=list[schemas.MandateOut])
def list_mandates(db: Session = Depends(get_db)):
    mandates = (
        db.query(models.Mandate)
        .options(joinedload(models.Mandate.client))
        .order_by(models.Mandate.signing_date.desc())
        .all()
    )
    return [_to_out(m) for m in mandates]


@router.post("", response_model=schemas.MandateOut)
def create_mandate(body: schemas.MandateCreate, db: Session = Depends(get_db)):
    client = db.query(models.Client).filter(models.Client.id == body.client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    mandate = models.Mandate(**body.model_dump())
    db.add(mandate)
    db.commit()
    db.refresh(mandate)
    return _to_out(mandate)


@router.patch("/{mandate_id}", response_model=schemas.MandateOut)
def update_mandate(mandate_id: int, body: schemas.MandateUpdate, db: Session = Depends(get_db)):
    mandate = db.query(models.Mandate).filter(models.Mandate.id == mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(mandate, field, value)
    db.commit()
    db.refresh(mandate)
    return _to_out(mandate)


@router.delete("/{mandate_id}")
def delete_mandate(mandate_id: int, db: Session = Depends(get_db)):
    mandate = db.query(models.Mandate).filter(models.Mandate.id == mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")
    db.delete(mandate)
    db.commit()
    return {"ok": True}
