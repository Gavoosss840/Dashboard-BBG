import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.utils import today

router = APIRouter(prefix="/api/compliance", tags=["compliance"])

EXPIRING_SOON_WINDOW_DAYS = 60


def _status(expiry: dt.date | None) -> tuple[str, int | None]:
    if expiry is None:
        return "missing", None
    days = (expiry - today()).days
    if days < 0:
        return "expired", days
    if days <= EXPIRING_SOON_WINDOW_DAYS:
        return "expiring_soon", days
    return "valid", days


class DocumentRenewal(BaseModel):
    validity_days: int = 365


@router.get("/documents", response_model=list[schemas.ComplianceDocumentOut])
def list_documents(
    status: str | None = Query(None),
    client_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.ComplianceDocument).options(joinedload(models.ComplianceDocument.client))
    if client_id:
        q = q.filter(models.ComplianceDocument.client_id == client_id)
    docs = q.order_by(models.ComplianceDocument.client_id, models.ComplianceDocument.doc_type).all()
    out = []
    for d in docs:
        computed_status, days = _status(d.expiry_date)
        if status and status != computed_status:
            continue
        item = schemas.ComplianceDocumentOut.model_validate(d)
        item.client_name = d.client.name
        item.status = computed_status
        item.days_to_expiry = days
        out.append(item)
    return out


@router.patch("/documents/{document_id}/renew", response_model=schemas.ComplianceDocumentOut)
def renew_document(document_id: int, body: DocumentRenewal, db: Session = Depends(get_db)):
    doc = db.query(models.ComplianceDocument).filter(models.ComplianceDocument.id == document_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.issued_date = today()
    doc.expiry_date = today() + dt.timedelta(days=body.validity_days)
    db.commit()
    db.refresh(doc)
    computed_status, days = _status(doc.expiry_date)
    item = schemas.ComplianceDocumentOut.model_validate(doc)
    item.client_name = doc.client.name
    item.status = computed_status
    item.days_to_expiry = days
    return item


@router.get("/summary", response_model=schemas.ComplianceSummaryOut)
def compliance_summary(db: Session = Depends(get_db)):
    docs = db.query(models.ComplianceDocument).all()
    counts = {"valid": 0, "expiring_soon": 0, "expired": 0, "missing": 0}
    for d in docs:
        computed_status, _ = _status(d.expiry_date)
        counts[computed_status] += 1

    mandates = (
        db.query(models.Mandate)
        .options(joinedload(models.Mandate.client))
        .filter(models.Mandate.status == "active", models.Mandate.renewal_date.isnot(None))
        .all()
    )
    renewals = [
        schemas.MandateRenewalOut(
            mandate_id=m.id,
            client_id=m.client_id,
            client_name=m.client.name,
            renewal_date=m.renewal_date,
            days_to_renewal=(m.renewal_date - today()).days,
            notice_period_days=m.notice_period_days,
        )
        for m in mandates
    ]
    renewals.sort(key=lambda r: r.days_to_renewal)
    upcoming = [r for r in renewals if r.days_to_renewal <= 180]

    return schemas.ComplianceSummaryOut(
        as_of=today(),
        valid=counts["valid"],
        expiring_soon=counts["expiring_soon"],
        expired=counts["expired"],
        missing=counts["missing"],
        upcoming_mandate_renewals=upcoming,
    )
