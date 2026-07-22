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
    has_login: bool = False


class SetPasswordRequest(BaseModel):
    new_password: str


# ---------- Auth ----------
class BootstrapRequest(BaseModel):
    name: str
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class BootstrapStatusOut(BaseModel):
    needs_bootstrap: bool


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ---------- Mandates ----------
class MandateOut(ORMBase):
    id: int
    client_id: int
    client_name: str = ""
    mandate_type: str
    status: str
    signing_date: dt.date
    renewal_date: dt.date | None
    entry_fee_pct: float
    mgmt_fee_pct: float
    exit_fee_pct: float
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
    listing_exchange: str = ""
    data_symbol: str = ""
    excluded: bool = False
    market_value: float = 0.0
    unrealized_pnl: float = 0.0


class NavPointOut(ORMBase):
    date: dt.date
    nav: float


class CashBalanceOut(ORMBase):
    currency: str
    amount: float


class TradeOut(ORMBase):
    id: int
    portfolio_id: int
    trade_date: dt.date
    side: str
    ticker: str
    name: str
    asset_class: str
    currency: str
    quantity: float
    price: float
    commission: float
    realized_pnl: float
    source: str


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
    cash_balances: list[CashBalanceOut] = []
    market_value: float = 0.0
    cash_total: float = 0.0
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
    twr_ytd: float | None = None
    twr_since_inception: float | None = None
    mandates: list[MandateOut] = []
    portfolios: list[PortfolioOut] = []


class ClientCreate(BaseModel):
    name: str
    client_type: str = "individual"
    status: str = "active"
    entry_date: dt.date
    base_currency: str = "EUR"
    country: str = ""
    email: str = ""
    phone: str = ""
    risk_profile: str = "balanced"
    kyc_status: str = "pending"
    relationship_manager_id: int | None = None
    notes: str = ""


class ClientUpdate(BaseModel):
    name: str | None = None
    client_type: str | None = None
    status: str | None = None
    entry_date: dt.date | None = None
    base_currency: str | None = None
    country: str | None = None
    email: str | None = None
    phone: str | None = None
    risk_profile: str | None = None
    kyc_status: str | None = None
    relationship_manager_id: int | None = None
    notes: str | None = None


class MandateCreate(BaseModel):
    client_id: int
    mandate_type: str = "discretionary"
    status: str = "active"
    signing_date: dt.date
    renewal_date: dt.date | None = None
    entry_fee_pct: float = 0.0
    mgmt_fee_pct: float = 1.5
    exit_fee_pct: float = 0.0
    perf_fee_pct: float = 15.0
    hurdle_rate_pct: float = 0.0
    high_water_mark: float = 0.0
    benchmark: str = ""
    notice_period_days: int = 30
    document_ref: str = ""


class MandateUpdate(BaseModel):
    mandate_type: str | None = None
    status: str | None = None
    signing_date: dt.date | None = None
    renewal_date: dt.date | None = None
    entry_fee_pct: float | None = None
    mgmt_fee_pct: float | None = None
    exit_fee_pct: float | None = None
    perf_fee_pct: float | None = None
    hurdle_rate_pct: float | None = None
    high_water_mark: float | None = None
    benchmark: str | None = None
    notice_period_days: int | None = None
    document_ref: str | None = None


class PortfolioCreate(BaseModel):
    client_id: int
    ptf_id: str
    base_currency: str = "EUR"
    strategy_bucket: str = "stock_picking"
    custodian: str = "Interactive Brokers"
    inception_nav: float = 0.0


class PortfolioUpdate(BaseModel):
    ptf_id: str | None = None
    base_currency: str | None = None
    strategy_bucket: str | None = None
    custodian: str | None = None
    inception_nav: float | None = None


class PositionCreate(BaseModel):
    portfolio_id: int | None = None  # supplied by the URL path, not the request body
    ticker: str
    name: str
    asset_class: str = "equity"
    sector: str = ""
    region: str = ""
    currency: str = "USD"
    quantity: float
    avg_cost: float
    last_price: float
    listing_exchange: str = ""
    data_symbol: str = ""


class PositionUpdate(BaseModel):
    ticker: str | None = None
    name: str | None = None
    asset_class: str | None = None
    sector: str | None = None
    region: str | None = None
    currency: str | None = None
    quantity: float | None = None
    avg_cost: float | None = None
    last_price: float | None = None
    listing_exchange: str | None = None
    data_symbol: str | None = None
    excluded: bool | None = None


class UserCreate(BaseModel):
    name: str
    email: str
    role: str = "associate"
    title: str = ""
    phone: str = ""
    avatar_initials: str = ""
    active: bool = True
    joined_date: dt.date
    bio: str = ""


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    role: str | None = None
    title: str | None = None
    phone: str | None = None
    avatar_initials: str | None = None
    active: bool | None = None
    joined_date: dt.date | None = None
    bio: str | None = None


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


class CashFlowOut(ORMBase):
    id: int
    client_id: int
    date: dt.date
    flow_type: str
    amount: float
    currency: str


class CashFlowCreate(BaseModel):
    client_id: int
    date: dt.date
    flow_type: str  # "deposit" | "withdrawal"
    amount: float
    currency: str = "EUR"


class CashFlowUpdate(BaseModel):
    date: dt.date | None = None
    flow_type: str | None = None
    amount: float | None = None
    currency: str | None = None


class RecurringContributionOut(ORMBase):
    id: int
    client_id: int
    flow_type: str
    amount: float
    currency: str
    day_of_month: int
    label: str
    active: bool
    start_date: dt.date
    end_date: dt.date | None = None
    last_generated_month: str | None = None


class RecurringContributionCreate(BaseModel):
    flow_type: str = "deposit"  # "deposit" | "withdrawal"
    amount: float
    currency: str = "EUR"
    day_of_month: int = 1
    label: str = ""
    active: bool = True
    start_date: dt.date
    end_date: dt.date | None = None


class RecurringContributionUpdate(BaseModel):
    flow_type: str | None = None
    amount: float | None = None
    currency: str | None = None
    day_of_month: int | None = None
    label: str | None = None
    active: bool | None = None
    start_date: dt.date | None = None
    end_date: dt.date | None = None


class AumTargetOut(ORMBase):
    id: int
    label: str
    target_amount: float
    currency: str
    target_date: dt.date | None
    notes: str
    current_aum: float = 0.0
    progress_pct: float = 0.0


class AumTargetCreate(BaseModel):
    label: str
    target_amount: float
    currency: str = "EUR"
    target_date: dt.date | None = None
    notes: str = ""


class AumTargetUpdate(BaseModel):
    label: str | None = None
    target_amount: float | None = None
    currency: str | None = None
    target_date: dt.date | None = None
    notes: str | None = None


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
    data_symbol: str | None = None
    name: str
    asset_class: str
    currency: str
    last_price: float
    day_change_pct: float
    target_price: float | None
    added_by: UserOut | None = None
    notes: str
    tags: str


# ---------- Sync (IBKR / market data) ----------
class SyncLogOut(ORMBase):
    id: int
    kind: str
    started_at: dt.datetime
    finished_at: dt.datetime | None
    status: str
    message: str


class SyncStatusOut(BaseModel):
    ibkr_configured: bool
    ibkr_connections: int = 0
    last_ibkr_sync: SyncLogOut | None = None
    last_market_refresh: SyncLogOut | None = None
    last_backup: SyncLogOut | None = None
    last_earnings_sync: SyncLogOut | None = None


class IbkrConnectionCreate(BaseModel):
    label: str = ""
    token: str
    query_id: str


class IbkrConnectionOut(BaseModel):
    id: str
    label: str
    query_id: str
    token_masked: str


class IbkrTestResult(BaseModel):
    ok: bool
    accounts: list[str]
    message: str


class AuditLogOut(ORMBase):
    id: int
    timestamp: dt.datetime
    user_id: int | None
    user_name: str
    method: str
    path: str
    status_code: int


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
