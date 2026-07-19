import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.services import fee_engine, pnl
from app.services.fx import convert
from app.utils import today

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
        if t.status in ("invoiced", "pending") and t.due_date and t.due_date < today()
    )
    paid_ytd = sum(
        convert(t.amount, t.currency, ccy, rates)
        for t in txns
        if t.status == "paid" and t.paid_date and t.paid_date.year == today().year
    )
    return {"currency": ccy, "pending": pending, "overdue": overdue, "paid_ytd": paid_ytd}


def _mandate_query(db: Session):
    return (
        db.query(models.Mandate)
        .options(
            joinedload(models.Mandate.client).joinedload(models.Client.portfolios).joinedload(models.Portfolio.nav_history)
        )
        .filter(models.Mandate.status == "active")
    )


@router.get("/fee-engine/preview", response_model=list[schemas.FeeEnginePreviewOut])
def fee_engine_preview(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    mandates = _mandate_query(db).all()
    all_txns = db.query(models.Transaction).all()
    out = []
    for m in mandates:
        client_txns = [t for t in all_txns if t.client_id == m.client_id]
        calc = fee_engine.preview(m.client, m, client_txns, rates, ccy, today())
        out.append(
            schemas.FeeEnginePreviewOut(
                mandate_id=m.id,
                client_id=m.client_id,
                client_name=m.client.name,
                currency=ccy,
                period_start=calc["period_start"],
                period_end=calc["period_end"],
                current_nav=calc["current_nav"],
                mgmt_fee_pct=m.mgmt_fee_pct,
                accrued_mgmt_fee=calc["accrued_mgmt_fee"],
                high_water_mark=convert(m.high_water_mark, m.client.base_currency, ccy, rates),
                hurdle_rate_pct=m.hurdle_rate_pct,
                perf_fee_pct=m.perf_fee_pct,
                accrued_perf_fee=calc["accrued_perf_fee"],
                mgmt_fee_invoiceable=calc["mgmt_fee_invoiceable"],
                perf_fee_crystallizable=calc["perf_fee_crystallizable"],
            )
        )
    return out


@router.post("/fee-engine/generate/{mandate_id}", response_model=schemas.TransactionOut)
def generate_management_fee(mandate_id: int, db: Session = Depends(get_db), rates: dict = Depends(fx_rates)):
    mandate = _mandate_query(db).filter(models.Mandate.id == mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")
    client_txns = db.query(models.Transaction).filter(models.Transaction.client_id == mandate.client_id).all()
    calc = fee_engine.preview(mandate.client, mandate, client_txns, rates, mandate.client.base_currency, today())
    if not calc["mgmt_fee_invoiceable"]:
        raise HTTPException(status_code=400, detail="Aucun frais de gestion à facturer sur la période")

    txn = models.Transaction(
        client_id=mandate.client_id,
        transaction_type="management_fee",
        amount=round(calc["mgmt_fee_base_ccy"], 2),
        currency=mandate.client.base_currency,
        status="draft",
        issue_date=today(),
        due_date=today() + dt.timedelta(days=30),
        invoice_ref=f"INV-MGMT-{mandate.client_id:04d}-{today().strftime('%Y%m%d')}",
        description=f"Frais de gestion — période du {calc['period_start']} au {calc['period_end']} (généré par le fee engine)",
    )
    db.add(txn)
    db.commit()
    db.refresh(txn)
    item = schemas.TransactionOut.model_validate(txn)
    item.client_name = mandate.client.name
    return item


@router.post("/fee-engine/crystallize/{mandate_id}", response_model=schemas.TransactionOut)
def crystallize_performance_fee(mandate_id: int, db: Session = Depends(get_db), rates: dict = Depends(fx_rates)):
    mandate = _mandate_query(db).filter(models.Mandate.id == mandate_id).first()
    if not mandate:
        raise HTTPException(status_code=404, detail="Mandate not found")
    client_txns = db.query(models.Transaction).filter(models.Transaction.client_id == mandate.client_id).all()
    calc = fee_engine.preview(mandate.client, mandate, client_txns, rates, mandate.client.base_currency, today())
    if not calc["perf_fee_crystallizable"]:
        raise HTTPException(status_code=400, detail="Aucune performance fee à cristalliser (NAV sous le HWM/hurdle)")

    txn = models.Transaction(
        client_id=mandate.client_id,
        transaction_type="performance_fee",
        amount=round(calc["perf_fee_base_ccy"], 2),
        currency=mandate.client.base_currency,
        status="draft",
        issue_date=today(),
        due_date=today() + dt.timedelta(days=30),
        invoice_ref=f"INV-PERF-{mandate.client_id:04d}-{today().strftime('%Y%m%d')}",
        description=f"Performance fee cristallisée au {today()} (nouveau HWM: {calc['nav_end_base_ccy']:.2f} {mandate.client.base_currency})",
    )
    db.add(txn)
    mandate.high_water_mark = calc["nav_end_base_ccy"]
    db.commit()
    db.refresh(txn)
    item = schemas.TransactionOut.model_validate(txn)
    item.client_name = mandate.client.name
    return item


def _current_aum(db: Session, rates: dict, ccy: str) -> float:
    clients = db.query(models.Client).options(
        joinedload(models.Client.portfolios).joinedload(models.Portfolio.nav_history)
    ).all()
    return pnl.total_aum(clients, rates, ccy)


def _target_to_out(target: models.AumTarget, current_aum: float, rates: dict, ccy: str) -> schemas.AumTargetOut:
    target_in_ccy = convert(target.target_amount, target.currency, ccy, rates)
    item = schemas.AumTargetOut.model_validate(target)
    item.current_aum = current_aum
    item.progress_pct = (current_aum / target_in_ccy * 100) if target_in_ccy else 0.0
    return item


@router.get("/aum-targets", response_model=list[schemas.AumTargetOut])
def list_aum_targets(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    current_aum = _current_aum(db, rates, ccy)
    targets = db.query(models.AumTarget).order_by(models.AumTarget.target_date).all()
    return [_target_to_out(t, current_aum, rates, ccy) for t in targets]


@router.post("/aum-targets", response_model=schemas.AumTargetOut)
def create_aum_target(
    body: schemas.AumTargetCreate,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    target = models.AumTarget(**body.model_dump())
    db.add(target)
    db.commit()
    db.refresh(target)
    return _target_to_out(target, _current_aum(db, rates, ccy), rates, ccy)


@router.patch("/aum-targets/{target_id}", response_model=schemas.AumTargetOut)
def update_aum_target(
    target_id: int,
    body: schemas.AumTargetUpdate,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    target = db.query(models.AumTarget).filter(models.AumTarget.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(target, field, value)
    db.commit()
    db.refresh(target)
    return _target_to_out(target, _current_aum(db, rates, ccy), rates, ccy)


@router.delete("/aum-targets/{target_id}")
def delete_aum_target(target_id: int, db: Session = Depends(get_db)):
    target = db.query(models.AumTarget).filter(models.AumTarget.id == target_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    db.delete(target)
    db.commit()
    return {"ok": True}
