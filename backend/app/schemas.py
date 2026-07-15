import datetime as dt

from pydantic import BaseModel, ConfigDict


class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Users ----------
class UserOut(ORMBase):
    id: int
    name: str
    email: str
    role: str
    title: str
    phone: str
    avatar_initials: str
    active: bool
    joined_date: dt.date
    bio: str


# ---------- Mandates ----------
class MandateOut(ORMBase):
    id: int
    client_id: int
    client_name: str = ""
    mandate_type: str
    status: str
    signing_date: dt.date
    renewal_date: dt.date | None
    mgmt_fee_pct: float
    perf_fee_pct: float
    hurdle_rate_pct: float
    high_water_mark: float
    benchmark: str
    notice_period_days: int
    document_ref: str


# ---------- Positions / Portfolios ----------
class PositionOut(ORMBase):
    id: int
    portfolio_id: int
    ticker: str
    name: str
    asset_class: str
    sector: str
    region: str
    currency: str
    quantity: float
    avg_cost: float
    last_price: float
    market_value: float = 0.0
    unrealized_pnl: float = 0.0


class NavPointOut(ORMBase):
    date: dt.date
    nav: float


class PortfolioOut(ORMBase):
    id: int
    ptf_id: str
    client_id: int
    base_currency: str
    strategy_bucket: str
    custodian: str
    inception_nav: float
    positions: list[PositionOut] = []
    nav_history: list[NavPointOut] = []
    market_value: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl_ytd: float = 0.0
    realized_pnl_since_inception: float = 0.0


# ---------- Clients ----------
class ClientOut(ORMBase):
    id: int
    name: str
    client_type: str
    status: str
    entry_date: dt.date
    base_currency: str
    country: str
    email: str
    phone: str
    risk_profile: str
    kyc_status: str
    relationship_manager: UserOut | None = None
    notes: str
    total_deposits: float = 0.0
    total_withdrawals: float = 0.0
    net_deposits: float = 0.0
    current_nav: float = 0.0
    pnl_ytd: float = 0.0
    pnl_since_inception: float = 0.0
    mandates: list[MandateOut] = []
    portfolios: list[PortfolioOut] = []


class ClientSummaryOut(ORMBase):
    id: int
    name: str
    client_type: str
    status: str
    entry_date: dt.date
    base_currency: str
    net_deposits: float = 0.0
    current_nav: float = 0.0
    pnl_ytd: float = 0.0
    pnl_since_inception: float = 0.0


# ---------- Financier ----------
class TransactionOut(ORMBase):
    id: int
    client_id: int
    client_name: str = ""
    transaction_type: str
    amount: float
    currency: str
    status: str
    issue_date: dt.date
    due_date: dt.date | None
    paid_date: dt.date | None
    invoice_ref: str
    description: str


class FeeEnginePreviewOut(BaseModel):
    mandate_id: int
    client_id: int
    client_name: str
    currency: str
    period_start: dt.date
    period_end: dt.date
    current_nav: float
    mgmt_fee_pct: float
    accrued_mgmt_fee: float
    high_water_mark: float
    hurdle_rate_pct: float
    perf_fee_pct: float
    accrued_perf_fee: float
    mgmt_fee_invoiceable: bool
    perf_fee_crystallizable: bool


# ---------- CRM ----------
class CrmContactOut(ORMBase):
    id: int
    name: str
    contact_type: str
    stage: str
    source: str
    estimated_aum: float
    currency: str
    owner: UserOut | None = None
    next_action: str
    next_action_date: dt.date | None
    last_contact_date: dt.date | None
    linked_client_id: int | None
    notes: str


# ---------- Market / Watchlist / News / Earnings ----------
class WatchlistItemOut(ORMBase):
    id: int
    ticker: str
    name: str
    asset_class: str
    currency: str
    last_price: float
    day_change_pct: float
    target_price: float | None
    added_by: UserOut | None = None
    notes: str
    tags: str


class NewsItemOut(ORMBase):
    id: int
    headline: str
    summary: str
    source: str
    url: str
    published_at: dt.datetime
    tickers: str
    sentiment: str


class EarningsEventOut(ORMBase):
    id: int
    ticker: str
    company: str
    event_date: dt.date
    time_of_day: str
    eps_estimate: float | None
    eps_actual: float | None
    revenue_estimate_m: float | None
    revenue_actual_m: float | None
    alert_enabled: bool
    held_in_portfolio: bool


# ---------- Compliance ----------
class ComplianceDocumentOut(ORMBase):
    id: int
    client_id: int
    client_name: str = ""
    doc_type: str
    issued_date: dt.date | None
    expiry_date: dt.date | None
    notes: str
    status: str = "valid"
    days_to_expiry: int | None = None


class MandateRenewalOut(BaseModel):
    mandate_id: int
    client_id: int
    client_name: str
    renewal_date: dt.date
    days_to_renewal: int
    notice_period_days: int


class ComplianceSummaryOut(BaseModel):
    as_of: dt.date
    valid: int
    expiring_soon: int
    expired: int
    missing: int
    upcoming_mandate_renewals: list[MandateRenewalOut]


# ---------- Reference ----------
class ReferenceEntryOut(ORMBase):
    id: int
    category: str
    title: str
    content: str
    tags: str


# ---------- Allocation (risk parity) ----------
class AllocationBucketOut(ORMBase):
    id: int
    name: str
    aum: float
    currency: str
    lookback_days: int
    color: str
    realized_vol_annualized: float = 0.0
    current_weight_pct: float = 0.0
    target_weight_pct: float = 0.0
    rebalance_delta_pct: float = 0.0


class AllocationResultOut(ORMBase):
    buckets: list[AllocationBucketOut]
    total_aum: float
    method: str
    as_of: dt.date


class AggregatedHoldingOut(BaseModel):
    ticker: str
    name: str
    asset_class: str
    market_value: float
    weight_pct: float


class GlobalPortfolioOut(BaseModel):
    as_of: dt.date
    currency: str
    total_market_value: float
    total_unrealized_pnl: float
    by_asset_class: dict[str, float]
    by_sector: dict[str, float]
    by_region: dict[str, float]
    by_currency: dict[str, float]
    by_strategy_bucket: dict[str, float]
    by_client: dict[str, float]
    holdings: list[AggregatedHoldingOut]


# ---------- FX ----------
class FXRateOut(ORMBase):
    ccy: str
    rate_vs_usd: float
    updated_at: dt.datetime


# ---------- Dashboard ----------
class DashboardOut(ORMBase):
    as_of: dt.date
    total_aum: float
    currency: str
    num_clients: int
    num_active_mandates: int
    pnl_ytd: float
    pnl_since_inception: float
    aum_by_bucket: dict[str, float]
    aum_by_asset_class: dict[str, float]
    top_clients: list[ClientSummaryOut]
    nav_history: list[NavPointOut]
    pending_fees: float
    upcoming_earnings: int
    open_crm_leads: int
