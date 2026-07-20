"""Shared cash-flow creation: a deposit/withdrawal plus its auto-generated
entry/exit fee transaction (from the client's active mandate rate, if any).

Used both by the manual "+ Dépôt / Retrait" endpoint and by the recurring
contribution (DCA) generator, so the fee logic never drifts between the two."""

from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from app import models


def create_cash_flow(
    db: Session,
    client_id: int,
    flow_type: str,
    amount: float,
    currency: str,
    date: dt.date,
) -> models.CashFlow:
    cash_flow = models.CashFlow(
        client_id=client_id, date=date, flow_type=flow_type,
        amount=amount, currency=currency,
    )
    db.add(cash_flow)

    mandate = (
        db.query(models.Mandate)
        .filter(models.Mandate.client_id == client_id, models.Mandate.status == "active")
        .first()
    )
    if mandate:
        rate = mandate.entry_fee_pct if flow_type == "deposit" else mandate.exit_fee_pct
        if rate > 0:
            fee_amount = round(amount * rate / 100, 2)
            fee_type = "entry_fee" if flow_type == "deposit" else "exit_fee"
            label = "d'entrée" if flow_type == "deposit" else "de sortie"
            db.add(models.Transaction(
                client_id=client_id, transaction_type=fee_type, amount=fee_amount,
                currency=currency, status="draft", issue_date=date,
                due_date=date + dt.timedelta(days=30),
                invoice_ref=f"INV-{fee_type.upper().replace('_', '-')}-{client_id:04d}-{date.strftime('%Y%m%d')}",
                description=f"Frais {label} — {rate}% sur {amount:,.2f} {currency}",
            ))

    return cash_flow
