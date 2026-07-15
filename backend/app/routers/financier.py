import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.services.fx import convert

router = APIRouter(prefix="/api/financier", tags=["financier"])


class TransactionStatusUpdate(BaseModel):
    status: str
    paid_date: dt.date | None = None


@router.get("/transactions", response_model=list[schemas.TransactionOut])
def list_transactions(
    status: str | None = Query(None),
    client_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Transaction).options(joinedload(models.Transaction.client))
    if status:
        q = q.filter(models.Transaction.status == status)
    if client_id:
        q = q.filter(models.Transaction.client_id == client_id)
    txns = q.order_by(models.Transaction.issue_date.desc()).all()
    out = []
    for t in txns:
        item = schemas.TransactionOut.model_validate(t)
        item.client_name = t.client.name
        out.append(item)
    return out


@router.patch("/transactions/{transaction_id}", response_model=schemas.TransactionOut)
def update_transaction_status(
    transaction_id: int,
    body: TransactionStatusUpdate,
    db: Session = Depends(get_db),
):
    txn = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    txn.status = body.status
    txn.paid_date = body.paid_date
    db.commit()
    db.refresh(txn)
    item = schemas.TransactionOut.model_validate(txn)
    item.client_name = txn.client.name
    return item


@router.get("/summary")
def financier_summary(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    txns = db.query(models.Transaction).all()
    pending = sum(convert(t.amount, t.currency, ccy, rates) for t in txns if t.status in ("draft", "invoiced", "pending"))
    overdue = sum(
        convert(t.amount, t.currency, ccy, rates)
        for t in txns
        if t.status in ("invoiced", "pending") and t.due_date and t.due_date < dt.date.today()
    )
    paid_ytd = sum(
        convert(t.amount, t.currency, ccy, rates)
        for t in txns
        if t.status == "paid" and t.paid_date and t.paid_date.year == 2026
    )
    return {"currency": ccy, "pending": pending, "overdue": overdue, "paid_ytd": paid_ytd}
