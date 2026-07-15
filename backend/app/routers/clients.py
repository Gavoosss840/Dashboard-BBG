import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.services import pnl
from app.utils import AS_OF

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _client_query(db: Session):
    return db.query(models.Client).options(
        joinedload(models.Client.relationship_manager),
        joinedload(models.Client.mandates),
        joinedload(models.Client.portfolios).joinedload(models.Portfolio.positions),
        joinedload(models.Client.portfolios).joinedload(models.Portfolio.nav_history),
        joinedload(models.Client.cash_flows),
    )


def _build_client_out(client: models.Client, rates: dict, ccy: str) -> schemas.ClientOut:
    agg = pnl.client_aggregate(client, rates, ccy, AS_OF)
    out = schemas.ClientOut.model_validate(client)
    out.total_deposits = agg["total_deposits"]
    out.total_withdrawals = agg["total_withdrawals"]
    out.net_deposits = agg["net_deposits"]
    out.current_nav = agg["current_nav"]
    out.pnl_ytd = agg["pnl_ytd"]
    out.pnl_since_inception = agg["pnl_since_inception"]

    portfolios_out = []
    for p in client.portfolios:
        p_out = schemas.PortfolioOut.model_validate(p)
        p_out.market_value = pnl.portfolio_market_value(p, rates, ccy)
        p_out.unrealized_pnl = pnl.portfolio_unrealized_pnl(p, rates, ccy)
        p_out.realized_pnl_ytd = pnl.portfolio_pnl_ytd(p, rates, ccy, AS_OF)
        p_out.realized_pnl_since_inception = pnl.portfolio_pnl_since_inception(p, rates, ccy)
        positions_out = []
        for pos in p.positions:
            pos_out = schemas.PositionOut.model_validate(pos)
            pos_out.market_value = pnl.position_market_value(pos, rates, ccy)
            pos_out.unrealized_pnl = pnl.position_unrealized_pnl(pos, rates, ccy)
            positions_out.append(pos_out)
        p_out.positions = positions_out
        portfolios_out.append(p_out)
    out.portfolios = portfolios_out
    return out


@router.get("", response_model=list[schemas.ClientSummaryOut])
def list_clients(
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    clients = _client_query(db).order_by(models.Client.entry_date).all()
    out = []
    for c in clients:
        agg = pnl.client_aggregate(c, rates, ccy, AS_OF)
        summary = schemas.ClientSummaryOut.model_validate(c)
        summary.net_deposits = agg["net_deposits"]
        summary.current_nav = agg["current_nav"]
        summary.pnl_ytd = agg["pnl_ytd"]
        summary.pnl_since_inception = agg["pnl_since_inception"]
        out.append(summary)
    return out


@router.get("/{client_id}", response_model=schemas.ClientOut)
def get_client(
    client_id: int,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    client = _client_query(db).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return _build_client_out(client, rates, ccy)


@router.post("", response_model=schemas.ClientOut)
def create_client(
    body: schemas.ClientCreate,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    client = models.Client(**body.model_dump())
    db.add(client)
    db.commit()
    client = _client_query(db).filter(models.Client.id == client.id).first()
    return _build_client_out(client, rates, ccy)


@router.patch("/{client_id}", response_model=schemas.ClientOut)
def update_client(
    client_id: int,
    body: schemas.ClientUpdate,
    db: Session = Depends(get_db),
    ccy: str = Depends(target_currency),
    rates: dict = Depends(fx_rates),
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(client, field, value)
    db.commit()
    client = _client_query(db).filter(models.Client.id == client_id).first()
    return _build_client_out(client, rates, ccy)


@router.post("/{client_id}/cashflows", response_model=schemas.CashFlowOut)
def create_cash_flow(client_id: int, body: schemas.CashFlowCreate, db: Session = Depends(get_db)):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if body.flow_type not in ("deposit", "withdrawal"):
        raise HTTPException(status_code=400, detail="flow_type must be 'deposit' or 'withdrawal'")

    cash_flow = models.CashFlow(
        client_id=client_id, date=body.date, flow_type=body.flow_type,
        amount=body.amount, currency=body.currency,
    )
    db.add(cash_flow)

    # Auto-generate the entry/exit fee transaction from the active mandate's rate, if any.
    mandate = (
        db.query(models.Mandate)
        .filter(models.Mandate.client_id == client_id, models.Mandate.status == "active")
        .first()
    )
    if mandate:
        rate = mandate.entry_fee_pct if body.flow_type == "deposit" else mandate.exit_fee_pct
        if rate > 0:
            fee_amount = round(body.amount * rate / 100, 2)
            fee_type = "entry_fee" if body.flow_type == "deposit" else "exit_fee"
            label = "d'entrée" if body.flow_type == "deposit" else "de sortie"
            db.add(models.Transaction(
                client_id=client_id, transaction_type=fee_type, amount=fee_amount,
                currency=body.currency, status="draft", issue_date=body.date,
                due_date=body.date + dt.timedelta(days=30),
                invoice_ref=f"INV-{fee_type.upper().replace('_', '-')}-{client_id:04d}-{body.date.strftime('%Y%m%d')}",
                description=f"Frais {label} — {rate}% sur {body.amount:,.2f} {body.currency}",
            ))

    db.commit()
    db.refresh(cash_flow)
    return cash_flow


@router.delete("/{client_id}")
def delete_client(client_id: int, db: Session = Depends(get_db)):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Select only the id column (not full ORM entities) so the bulk deletes
    # below don't leave stale Portfolio objects in the session identity map —
    # otherwise SQLAlchemy tries to cascade-update them when the client is
    # deleted, raising a StaleDataError against rows already gone.
    portfolio_ids = [pid for (pid,) in db.query(models.Portfolio.id).filter(models.Portfolio.client_id == client_id).all()]
    if portfolio_ids:
        db.query(models.Position).filter(models.Position.portfolio_id.in_(portfolio_ids)).delete(synchronize_session=False)
        db.query(models.NavHistory).filter(models.NavHistory.portfolio_id.in_(portfolio_ids)).delete(synchronize_session=False)
        db.query(models.Portfolio).filter(models.Portfolio.client_id == client_id).delete(synchronize_session=False)
    db.query(models.Mandate).filter(models.Mandate.client_id == client_id).delete(synchronize_session=False)
    db.query(models.CashFlow).filter(models.CashFlow.client_id == client_id).delete(synchronize_session=False)
    db.query(models.Transaction).filter(models.Transaction.client_id == client_id).delete(synchronize_session=False)
    db.query(models.ComplianceDocument).filter(models.ComplianceDocument.client_id == client_id).delete(synchronize_session=False)
    db.query(models.CrmContact).filter(models.CrmContact.linked_client_id == client_id).update(
        {"linked_client_id": None}, synchronize_session=False
    )
    db.expire(client)
    db.delete(client)
    db.commit()
    return {"ok": True}
