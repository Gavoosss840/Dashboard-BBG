"""Automates management-fee accrual and performance-fee crystallization.

Simplifications (documented, not hidden):
  - Management fee accrues on the average of the client's NAV at the start
    and end of the accrual period (start = last invoiced date, end = today),
    pro-rated for the number of days elapsed. A real system would integrate
    the daily NAV curve rather than averaging two points.
  - The hurdle rate is applied as a flat uplift on the High-Water Mark
    (HWM * (1 + hurdle%)) rather than a compounded daily/annual hurdle.
  - All computation happens in the client's own base currency (where the
    HWM is anchored); only the final preview figures are converted to the
    caller's display currency.
"""

from __future__ import annotations

import datetime as dt

from app import models
from app.services import fx, pnl


def _last_mgmt_fee_date(transactions: list[models.Transaction], fallback: dt.date) -> dt.date:
    dates = [t.issue_date for t in transactions if t.transaction_type == "management_fee"]
    return max(dates) if dates else fallback


def preview(
    client: models.Client,
    mandate: models.Mandate,
    transactions: list[models.Transaction],
    rates: dict,
    display_ccy: str,
    as_of: dt.date,
) -> dict:
    base_ccy = client.base_currency
    period_start = _last_mgmt_fee_date(transactions, mandate.signing_date)
    period_end = as_of
    days = max((period_end - period_start).days, 0)

    nav_start_base = pnl.client_nav_at(client, rates, base_ccy, period_start)
    nav_end_base = pnl.client_nav_at(client, rates, base_ccy, period_end)
    avg_nav_base = (nav_start_base + nav_end_base) / 2
    mgmt_fee_base = avg_nav_base * (mandate.mgmt_fee_pct / 100) * (days / 365)

    threshold_base = mandate.high_water_mark * (1 + mandate.hurdle_rate_pct / 100)
    perf_fee_base = max(0.0, nav_end_base - threshold_base) * (mandate.perf_fee_pct / 100)

    return {
        "period_start": period_start,
        "period_end": period_end,
        "current_nav": fx.convert(nav_end_base, base_ccy, display_ccy, rates),
        "accrued_mgmt_fee": fx.convert(mgmt_fee_base, base_ccy, display_ccy, rates),
        "accrued_perf_fee": fx.convert(perf_fee_base, base_ccy, display_ccy, rates),
        "mgmt_fee_invoiceable": mgmt_fee_base > 0 and days >= 1,
        "perf_fee_crystallizable": perf_fee_base > 0,
        "mgmt_fee_base_ccy": mgmt_fee_base,
        "perf_fee_base_ccy": perf_fee_base,
        "nav_end_base_ccy": nav_end_base,
    }
