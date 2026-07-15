import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.utils import AS_OF

router = APIRouter(prefix="/api/crm", tags=["crm"])


class CrmContactIn(BaseModel):
    name: str
    contact_type: str = "prospect"
    stage: str = "lead"
    source: str = ""
    estimated_aum: float = 0.0
    currency: str = "EUR"
    owner_id: int | None = None
    next_action: str = ""
    next_action_date: dt.date | None = None
    linked_client_id: int | None = None
    notes: str = ""


class CrmContactUpdate(BaseModel):
    name: str | None = None
    contact_type: str | None = None
    stage: str | None = None
    source: str | None = None
    estimated_aum: float | None = None
    currency: str | None = None
    owner_id: int | None = None
    next_action: str | None = None
    next_action_date: dt.date | None = None
    linked_client_id: int | None = None
    notes: str | None = None


@router.get("/contacts", response_model=list[schemas.CrmContactOut])
def list_contacts(db: Session = Depends(get_db)):
    return (
        db.query(models.CrmContact)
        .options(joinedload(models.CrmContact.owner))
        .order_by(models.CrmContact.stage)
        .all()
    )


@router.post("/contacts", response_model=schemas.CrmContactOut)
def create_contact(body: CrmContactIn, db: Session = Depends(get_db)):
    contact = models.CrmContact(
        **body.model_dump(),
        last_contact_date=AS_OF,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.patch("/contacts/{contact_id}", response_model=schemas.CrmContactOut)
def update_contact(contact_id: int, body: CrmContactUpdate, db: Session = Depends(get_db)):
    contact = db.query(models.CrmContact).filter(models.CrmContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)
    contact.last_contact_date = AS_OF
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/contacts/{contact_id}")
def delete_contact(contact_id: int, db: Session = Depends(get_db)):
    contact = db.query(models.CrmContact).filter(models.CrmContact.id == contact_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    db.delete(contact)
    db.commit()
    return {"ok": True}
