"""Interactive Brokers integration point (not yet connected).

This module is the seam where real IBKR data replaces the mock seed data.
Once the IBKR connector is authorized, implement `IBKRClient` against the
Client Portal Web API (REST, good for positions/PnL snapshots) or `ib_insync`
over TWS/Gateway (better for streaming quotes). Every function below should
return the same shapes the routers already consume from `models`, so
swapping the data source doesn't require touching the API layer.

Planned mapping:
  - fetch_positions(account_id)  -> list of Position-shaped dicts (ticker,
    quantity, avg_cost, last_price, currency) to sync into `models.Position`.
  - fetch_account_nav(account_id) -> today's NAV, to append to
    `models.NavHistory` (replaces the seeded random walk).
  - fetch_realized_pnl(account_id, start, end) -> realized P&L for a period,
    to reconcile against `services.pnl` (which currently derives P&L purely
    from the NAV curve).
  - A scheduled job (e.g. APScheduler or a cron hitting a sync endpoint)
    should call these once a day per portfolio.ptf_id and upsert rows -
    no seed_data changes needed once this is live.
"""

from __future__ import annotations


class IBKRClient:
    def __init__(self, *_args, **_kwargs):
        raise NotImplementedError(
            "IBKR connector not yet authorized for this environment. "
            "Implement this class against the Client Portal Web API or "
            "ib_insync once credentials are available."
        )
