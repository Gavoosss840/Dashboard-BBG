export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  title: string;
  phone: string;
  avatar_initials: string;
  active: boolean;
  joined_date: string;
  bio: string;
  has_login: boolean;
}

export interface Mandate {
  id: number;
  client_id: number;
  client_name: string;
  mandate_type: string;
  status: string;
  signing_date: string;
  renewal_date: string | null;
  entry_fee_pct: number;
  mgmt_fee_pct: number;
  exit_fee_pct: number;
  perf_fee_pct: number;
  hurdle_rate_pct: number;
  high_water_mark: number;
  benchmark: string;
  notice_period_days: number;
  document_ref: string;
}

export interface CashFlow {
  id: number;
  client_id: number;
  date: string;
  flow_type: string;
  amount: number;
  currency: string;
}

export interface CashFlowInput {
  date: string;
  flow_type: string;
  amount: number;
  currency: string;
}

export interface AumTarget {
  id: number;
  label: string;
  target_amount: number;
  currency: string;
  target_date: string | null;
  notes: string;
  current_aum: number;
  progress_pct: number;
}

export interface AumTargetInput {
  label: string;
  target_amount: number;
  currency: string;
  target_date: string | null;
  notes: string;
}

export interface BootstrapStatus {
  needs_bootstrap: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Position {
  id: number;
  portfolio_id: number;
  ticker: string;
  name: string;
  asset_class: string;
  sector: string;
  region: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  last_price: number;
  market_value: number;
  unrealized_pnl: number;
}

export interface NavPoint {
  date: string;
  nav: number;
}

export interface CashBalance {
  currency: string;
  amount: number;
}

export interface Trade {
  id: number;
  portfolio_id: number;
  trade_date: string;
  side: string;
  ticker: string;
  name: string;
  asset_class: string;
  currency: string;
  quantity: number;
  price: number;
  commission: number;
  realized_pnl: number;
  source: string;
}

export interface Portfolio {
  id: number;
  ptf_id: string;
  client_id: number;
  base_currency: string;
  strategy_bucket: string;
  custodian: string;
  inception_nav: number;
  positions: Position[];
  nav_history: NavPoint[];
  cash_balances: CashBalance[];
  market_value: number;
  cash_total: number;
  unrealized_pnl: number;
  realized_pnl_ytd: number;
  realized_pnl_since_inception: number;
}

export interface ClientSummary {
  id: number;
  name: string;
  client_type: string;
  status: string;
  entry_date: string;
  base_currency: string;
  net_deposits: number;
  current_nav: number;
  pnl_ytd: number;
  pnl_since_inception: number;
}

export interface Client extends ClientSummary {
  country: string;
  email: string;
  phone: string;
  risk_profile: string;
  kyc_status: string;
  relationship_manager: User | null;
  notes: string;
  total_deposits: number;
  total_withdrawals: number;
  twr_ytd: number | null;
  twr_since_inception: number | null;
  mandates: Mandate[];
  portfolios: Portfolio[];
}

export interface Transaction {
  id: number;
  client_id: number;
  client_name: string;
  transaction_type: string;
  amount: number;
  currency: string;
  status: string;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  invoice_ref: string;
  description: string;
}

export interface ClientInput {
  name: string;
  client_type: string;
  status: string;
  entry_date: string;
  base_currency: string;
  country: string;
  email: string;
  phone: string;
  risk_profile: string;
  kyc_status: string;
  relationship_manager_id: number | null;
  notes: string;
}

export interface MandateInput {
  client_id: number;
  mandate_type: string;
  status: string;
  signing_date: string;
  renewal_date: string | null;
  entry_fee_pct: number;
  mgmt_fee_pct: number;
  exit_fee_pct: number;
  perf_fee_pct: number;
  hurdle_rate_pct: number;
  high_water_mark: number;
  benchmark: string;
  notice_period_days: number;
  document_ref: string;
}

export interface PortfolioInput {
  client_id: number;
  ptf_id: string;
  base_currency: string;
  strategy_bucket: string;
  custodian: string;
  inception_nav: number;
}

export interface PositionInput {
  ticker: string;
  name: string;
  asset_class: string;
  sector: string;
  region: string;
  currency: string;
  quantity: number;
  avg_cost: number;
  last_price: number;
}

export interface UserInput {
  name: string;
  email: string;
  role: string;
  title: string;
  phone: string;
  avatar_initials: string;
  active: boolean;
  joined_date: string;
  bio: string;
}

export interface FeeEnginePreview {
  mandate_id: number;
  client_id: number;
  client_name: string;
  currency: string;
  period_start: string;
  period_end: string;
  current_nav: number;
  mgmt_fee_pct: number;
  accrued_mgmt_fee: number;
  high_water_mark: number;
  hurdle_rate_pct: number;
  perf_fee_pct: number;
  accrued_perf_fee: number;
  mgmt_fee_invoiceable: boolean;
  perf_fee_crystallizable: boolean;
}

export interface ComplianceDocument {
  id: number;
  client_id: number;
  client_name: string;
  doc_type: string;
  issued_date: string | null;
  expiry_date: string | null;
  notes: string;
  status: "valid" | "expiring_soon" | "expired" | "missing";
  days_to_expiry: number | null;
}

export interface MandateRenewal {
  mandate_id: number;
  client_id: number;
  client_name: string;
  renewal_date: string;
  days_to_renewal: number;
  notice_period_days: number;
}

export interface ComplianceSummary {
  as_of: string;
  valid: number;
  expiring_soon: number;
  expired: number;
  missing: number;
  upcoming_mandate_renewals: MandateRenewal[];
}

export interface CrmContact {
  id: number;
  name: string;
  contact_type: string;
  stage: string;
  source: string;
  estimated_aum: number;
  currency: string;
  owner: User | null;
  next_action: string;
  next_action_date: string | null;
  last_contact_date: string | null;
  linked_client_id: number | null;
  notes: string;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  data_symbol: string | null;
  name: string;
  asset_class: string;
  currency: string;
  last_price: number;
  day_change_pct: number;
  target_price: number | null;
  added_by: User | null;
  notes: string;
  tags: string;
}

export interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  url: string;
  published_at: string;
  tickers: string;
  sentiment: string;
}

export interface EarningsEvent {
  id: number;
  ticker: string;
  company: string;
  event_date: string;
  time_of_day: string;
  eps_estimate: number | null;
  eps_actual: number | null;
  revenue_estimate_m: number | null;
  revenue_actual_m: number | null;
  alert_enabled: boolean;
  held_in_portfolio: boolean;
}

export interface ReferenceEntry {
  id: number;
  category: string;
  title: string;
  content: string;
  tags: string;
}

export interface AllocationBucket {
  id: number;
  name: string;
  aum: number;
  currency: string;
  lookback_days: number;
  color: string;
  realized_vol_annualized: number;
  current_weight_pct: number;
  target_weight_pct: number;
  rebalance_delta_pct: number;
}

export interface AllocationResult {
  buckets: AllocationBucket[];
  total_aum: number;
  method: string;
  as_of: string;
}

export interface FXRate {
  ccy: string;
  rate_vs_usd: number;
  updated_at: string;
}

export interface AggregatedHolding {
  ticker: string;
  name: string;
  asset_class: string;
  market_value: number;
  weight_pct: number;
}

export interface GlobalPortfolio {
  as_of: string;
  currency: string;
  total_market_value: number;
  total_unrealized_pnl: number;
  by_asset_class: Record<string, number>;
  by_sector: Record<string, number>;
  by_region: Record<string, number>;
  by_currency: Record<string, number>;
  by_strategy_bucket: Record<string, number>;
  by_client: Record<string, number>;
  holdings: AggregatedHolding[];
}

export interface Dashboard {
  as_of: string;
  total_aum: number;
  currency: string;
  num_clients: number;
  num_active_mandates: number;
  pnl_ytd: number;
  pnl_since_inception: number;
  aum_by_bucket: Record<string, number>;
  aum_by_asset_class: Record<string, number>;
  top_clients: ClientSummary[];
  nav_history: NavPoint[];
  pending_fees: number;
  upcoming_earnings: number;
  open_crm_leads: number;
}

export interface SyncLog {
  id: number;
  kind: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  message: string;
}

export interface SyncStatus {
  ibkr_configured: boolean;
  last_ibkr_sync: SyncLog | null;
  last_market_refresh: SyncLog | null;
  last_backup: SyncLog | null;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  user_id: number | null;
  user_name: string;
  method: string;
  path: string;
  status_code: number;
}

export interface TapeQuote {
  symbol: string;
  display: string;
  price: number | null;
  change_pct: number | null;
  currency: string;
  stale: boolean;
}

export interface SecurityQuote {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  price: number;
  previous_close: number | null;
  change_pct: number;
  day_high: number | null;
  day_low: number | null;
  volume: number | null;
  fifty_two_week_high: number | null;
  fifty_two_week_low: number | null;
  instrument_type: string;
}

export interface ChartPoint {
  t: number;
  c: number;
  v: number;
}

export interface SecurityChart {
  symbol: string;
  currency: string;
  range: string;
  previous_close: number | null;
  points: ChartPoint[];
}

export interface SecuritySearchQuote {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
  sector: string | null;
  industry: string | null;
}

export interface SecurityNewsItem {
  title: string;
  publisher: string;
  link: string;
  published_at: number | null;
}

export interface SecuritySearchResult {
  quotes: SecuritySearchQuote[];
  news: SecurityNewsItem[];
}

export interface SecurityFundamentals {
  market_cap: number | null;
  trailing_pe: number | null;
  forward_pe: number | null;
  eps: number | null;
  dividend_yield: number | null;
  beta: number | null;
  avg_volume: number | null;
  profit_margin: number | null;
  revenue: number | null;
  revenue_growth: number | null;
  target_mean_price: number | null;
  recommendation: string | null;
  num_analysts: number | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  website: string | null;
  country: string | null;
  description: string | null;
}

export interface SecurityHolding {
  client_id: number | null;
  client_name: string;
  ptf_id: string;
  quantity: number;
  avg_cost: number;
  currency: string;
}

export interface SecurityOverview {
  quote: SecurityQuote;
  fundamentals: SecurityFundamentals | null;
  news: SecurityNewsItem[];
  holdings: SecurityHolding[];
  total_quantity: number;
  in_watchlist: boolean;
  watchlist_item_id: number | null;
}
