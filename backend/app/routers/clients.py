import datetime as dt

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from app import models, schemas
from app.database import get_db
from app.deps import fx_rates, target_currency
from app.services import cashflow as cashflow_service
from app.services import pnl
from app.utils import today

router = APIRouter(prefix="/api/clients", tags=["clients"])


def _client_query(db: Session):
    # selectinload (separate batched query per collection), not joinedload:
    # this client fans out into several one-to-many collections at once
    # (portfolios -> positions / nav_history / cash_balances, plus mandates
    # and cash_flows). Joining them all in one SQL statement multiplies rows
    # combinatorially (positions x nav_history x cash_balances per portfolio)
    # — harmless for a small demo book, but a real IBKR-synced account with
    # hundreds of positions and months of NAV history turns into millions of
    # SQL rows for a single client fetch. selectinload loads each collection
    # with its own "WHERE parent_id IN (...)" query instead, with no fan-out.
    return db.query(models.Client).options(
        joinedload(models.Client.relationship_manager),
        selectinload(models.Client.mandates),
        selectinload(models.Client.portfolios).selectinload(models.Portfolio.positions),
        selectinload(models.Client.portfolios).selectinload(models.Portfolio.nav_history),
        selectinload(models.Client.portfolios).selectinload(models.Portfolio.cash_balances),
        selectinload(models.Client.cash_flows),
    )


def _build_client_out(client: models.Client, rates: dict, ccy: str) -> schemas.ClientOut:
    agg = pnl.client_aggregate(client, rates, ccy, today())
    out = schemas.ClientOut.model_validate(client)
    out.total_deposits = agg["total_deposits"]
    out.total_withdrawals = agg["total_withdrawals"]
    out.net_deposits = agg["net_deposits"]
    out.current_nav = agg["current_nav"]
    out.pnl_ytd = agg["pnl_ytd"]
    out.pnl_since_inception = agg["pnl_since_inception"]
    out.twr_ytd = agg["twr_ytd"]
    out.twr_since_inception = agg["twr_since_inception"]

    portfolios_out = []
    for p in client.portfolios:
        p_out = schemas.PortfolioOut.model_validate(p)
        p_out.market_value = pnl.portfolio_market_value(p, rates, ccy)
        p_out.cash_total = pnl.portfolio_cash(p, rates, ccy)
        p_out.unrealized_pnl = pnl.portfolio_unrealized_pnl(p, rates, ccy)
        p_out.realized_pnl_ytd = pnl.portfolio_pnl_ytd(p, rates, ccy, today())
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
        agg = pnl.client_aggregate(c, rates, ccy, today())
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

    cash_flow = cashflow_service.create_cash_flow(
        db, client_id, body.flow_type, body.amount, body.currency, body.date,
    )
    db.commit()
    db.refresh(cash_flow)
    return cash_flow


@router.get("/{client_id}/cashflows", response_model=list[schemas.CashFlowOut])
def list_cash_flows(client_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.CashFlow)
        .filter(models.CashFlow.client_id == client_id)
        .order_by(models.CashFlow.date.desc(), models.CashFlow.id.desc())
        .all()
    )


@router.patch("/cashflows/{cashflow_id}", response_model=schemas.CashFlowOut)
def update_cash_flow(cashflow_id: int, body: schemas.CashFlowUpdate, db: Session = Depends(get_db)):
    row = db.query(models.CashFlow).filter(models.CashFlow.id == cashflow_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cash flow not found")
    updates = body.model_dump(exclude_unset=True)
    if "flow_type" in updates and updates["flow_type"] not in ("deposit", "withdrawal"):
        raise HTTPException(status_code=400, detail="flow_type must be 'deposit' or 'withdrawal'")
    for field, value in updates.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/cashflows/{cashflow_id}")
def delete_cash_flow(cashflow_id: int, db: Session = Depends(get_db)):
    row = db.query(models.CashFlow).filter(models.CashFlow.id == cashflow_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cash flow not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/{client_id}/recurring-contributions", response_model=list[schemas.RecurringContributionOut])
def list_recurring_contributions(client_id: int, db: Session = Depends(get_db)):
    return (
        db.query(models.RecurringContribution)
        .filter(models.RecurringContribution.client_id == client_id)
        .order_by(models.RecurringContribution.id)
        .all()
    )


@router.post("/{client_id}/recurring-contributions", response_model=schemas.RecurringContributionOut)
def create_recurring_contribution(
    client_id: int, body: schemas.RecurringContributionCreate, db: Session = Depends(get_db)
):
    client = db.query(models.Client).filter(models.Client.id == client_id).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    if body.flow_type not in ("deposit", "withdrawal"):
        raise HTTPException(status_code=400, detail="flow_type must be 'deposit' or 'withdrawal'")
    if not 1 <= body.day_of_month <= 28:
        raise HTTPException(status_code=400, detail="day_of_month doit être entre 1 et 28 (compatible tous les mois)")

    row = models.RecurringContribution(client_id=client_id, **body.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/recurring-contributions/{recurring_id}", response_model=schemas.RecurringContributionOut)
def update_recurring_contribution(
    recurring_id: int, body: schemas.RecurringContributionUpdate, db: Session = Depends(get_db)
):
    row = db.query(models.RecurringContribution).filter(models.RecurringContribution.id == recurring_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recurring contribution not found")
    updates = body.model_dump(exclude_unset=True)
    if "day_of_month" in updates and not 1 <= updates["day_of_month"] <= 28:
        raise HTTPException(status_code=400, detail="day_of_month doit être entre 1 et 28 (compatible tous les mois)")
    for field, value in updates.items():
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/recurring-contributions/{recurring_id}")
def delete_recurring_contribution(recurring_id: int, db: Session = Depends(get_db)):
    row = db.query(models.RecurringContribution).filter(models.RecurringContribution.id == recurring_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Recurring contribution not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


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
