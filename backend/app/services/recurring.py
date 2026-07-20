"""DCA-style recurring contributions: generate the client's monthly deposit
(or withdrawal) automatically, reusing the same fee logic as a manual entry.

Idempotent per calendar month via `last_generated_month` ("YYYY-MM") on the
row — safe to call as often as the scheduler ticks."""

from __future__ import annotations

import calendar
import datetime as dt

from sqlalchemy.orm import Session

from app import models
from app.services import cashflow as cashflow_service


def _due_date_for(today: dt.date, day_of_month: int) -> dt.date:
    """Clamp the target day to the current month's length (e.g. day 31 in
    February becomes the 28th/29th)."""
    last_day = calendar.monthrange(today.year, today.month)[1]
    return today.replace(day=min(day_of_month, last_day))


def run_due_contributions(db: Session, today: dt.date | None = None) -> dict:
    """Generate every active recurring contribution whose scheduled day has
    arrived and that hasn't fired this month yet. Returns a summary dict."""
    today = today or dt.date.today()
    current_month = today.strftime("%Y-%m")

    rows = db.query(models.RecurringContribution).filter(
        models.RecurringContribution.active.is_(True),
        models.RecurringContribution.start_date <= today,
    ).all()

    generated: list[dict] = []
    for row in rows:
        if row.end_date is not None and row.end_date < today:
            continue
        if row.last_generated_month == current_month:
            continue  # already fired this month
        due_date = _due_date_for(today, row.day_of_month)
        if today < due_date:
            continue  # not yet due this month

        cash_flow = cashflow_service.create_cash_flow(
            db, row.client_id, row.flow_type, row.amount, row.currency, due_date,
        )
        row.last_generated_month = current_month
        db.flush()
        generated.append({
            "recurring_id": row.id, "client_id": row.client_id,
            "cash_flow_id": cash_flow.id, "amount": row.amount, "currency": row.currency,
        })

    if generated:
        db.commit()
    return {"generated": generated, "count": len(generated)}
