import type {
  AllocationResult,
  AuditLog,
  AumTarget,
  AumTargetInput,
  BootstrapStatus,
  CashFlow,
  CashFlowInput,
  Client,
  ClientInput,
  ClientSummary,
  ComplianceDocument,
  ComplianceSummary,
  CrmContact,
  Dashboard,
  EarningsEvent,
  FeeEnginePreview,
  FXRate,
  GlobalPortfolio,
  IbkrConnection,
  IbkrTestResult,
  LiveNewsItem,
  Mandate,
  MarketGroup,
  MandateInput,
  NewsItem,
  Portfolio,
  PortfolioAnalytics,
  PortfolioInput,
  PortfolioReport,
  Position,
  PositionInput,
  ReferenceEntry,
  RecurringContribution,
  RecurringContributionInput,
  RiskCheckResult,
  RiskSettings,
  SecurityChart,
  SecurityOverview,
  SecurityQuote,
  SecuritySearchResult,
  SyncLog,
  TaurusSignal,
  MomentumSignal,
  SecurityNote,
  SyncStatus,
  TapeQuote,
  Trade,
  Transaction,
  TokenResponse,
  User,
  UserInput,
  WatchlistItem,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "boulet-capital-token";

export function getToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  // A 401 from login/bootstrap just means "wrong credentials" — let the caller
  // handle it inline. Only treat 401s from everywhere else as "session expired".
  const isAuthEndpoint = path.startsWith("/api/auth/login") || path.startsWith("/api/auth/bootstrap");
  if (res.status === 401 && !isAuthEndpoint) {
    clearToken();
    window.dispatchEvent(new Event("auth:unauthorized"));
  }
  if (!res.ok) {
    const body = await res.text();
    // Surface FastAPI's "detail" as a clean message when present
    let message = `API error ${res.status} on ${path}: ${body}`;
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed?.detail === "string") message = parsed.detail;
    } catch {
      // body wasn't JSON — keep the raw message
    }
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  bootstrapStatus: () => request<BootstrapStatus>(`/api/auth/bootstrap-status`),
  bootstrap: (name: string, email: string, password: string) =>
    request<TokenResponse>(`/api/auth/bootstrap`, { method: "POST", body: JSON.stringify({ name, email, password }) }),
  login: (email: string, password: string) =>
    request<TokenResponse>(`/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request<User>(`/api/auth/me`),
  changePassword: (current_password: string, new_password: string) =>
    request<{ ok: boolean }>(`/api/auth/change-password`, {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  dashboard: (ccy: string) => request<Dashboard>(`/api/dashboard?ccy=${ccy}`),

  clients: (ccy: string) => request<ClientSummary[]>(`/api/clients?ccy=${ccy}`),
  client: (id: number, ccy: string) => request<Client>(`/api/clients/${id}?ccy=${ccy}`),
  createClient: (payload: ClientInput, ccy = "EUR") =>
    request<Client>(`/api/clients?ccy=${ccy}`, { method: "POST", body: JSON.stringify(payload) }),
  updateClient: (id: number, payload: Partial<ClientInput>, ccy = "EUR") =>
    request<Client>(`/api/clients/${id}?ccy=${ccy}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteClient: (id: number) => request<{ ok: boolean }>(`/api/clients/${id}`, { method: "DELETE" }),
  createCashFlow: (clientId: number, payload: CashFlowInput) =>
    request<CashFlow>(`/api/clients/${clientId}/cashflows`, {
      method: "POST",
      body: JSON.stringify({ ...payload, client_id: clientId }),
    }),
  cashFlows: (clientId: number) => request<CashFlow[]>(`/api/clients/${clientId}/cashflows`),
  updateCashFlow: (id: number, payload: Partial<CashFlowInput>) =>
    request<CashFlow>(`/api/clients/cashflows/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCashFlow: (id: number) => request<{ ok: boolean }>(`/api/clients/cashflows/${id}`, { method: "DELETE" }),

  recurringContributions: (clientId: number) =>
    request<RecurringContribution[]>(`/api/clients/${clientId}/recurring-contributions`),
  createRecurringContribution: (clientId: number, payload: RecurringContributionInput) =>
    request<RecurringContribution>(`/api/clients/${clientId}/recurring-contributions`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRecurringContribution: (id: number, payload: Partial<RecurringContributionInput>) =>
    request<RecurringContribution>(`/api/clients/recurring-contributions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteRecurringContribution: (id: number) =>
    request<{ ok: boolean }>(`/api/clients/recurring-contributions/${id}`, { method: "DELETE" }),

  globalPortfolio: (ccy: string) => request<GlobalPortfolio>(`/api/portfolios/global?ccy=${ccy}`),
  portfolio: (id: number, ccy: string) => request<Portfolio>(`/api/portfolios/${id}?ccy=${ccy}`),
  createPortfolio: (payload: PortfolioInput) =>
    request<Portfolio>(`/api/portfolios`, { method: "POST", body: JSON.stringify(payload) }),
  updatePortfolio: (id: number, payload: Partial<PortfolioInput>) =>
    request<Portfolio>(`/api/portfolios/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePortfolio: (id: number) => request<{ ok: boolean }>(`/api/portfolios/${id}`, { method: "DELETE" }),
  createPosition: (portfolioId: number, payload: PositionInput) =>
    request<Position>(`/api/portfolios/${portfolioId}/positions`, { method: "POST", body: JSON.stringify(payload) }),
  updatePosition: (id: number, payload: Partial<PositionInput>) =>
    request<Position>(`/api/portfolios/positions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deletePosition: (id: number) => request<{ ok: boolean }>(`/api/portfolios/positions/${id}`, { method: "DELETE" }),

  transactions: (params?: { status?: string; client_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.client_id) q.set("client_id", String(params.client_id));
    const qs = q.toString();
    return request<Transaction[]>(`/api/financier/transactions${qs ? `?${qs}` : ""}`);
  },
  updateTransactionStatus: (id: number, status: string, paid_date?: string | null) =>
    request<Transaction>(`/api/financier/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, paid_date: paid_date ?? null }),
    }),
  financierSummary: (ccy: string) =>
    request<{ currency: string; pending: number; overdue: number; paid_ytd: number }>(
      `/api/financier/summary?ccy=${ccy}`
    ),

  mandates: () => request<Mandate[]>(`/api/mandates`),
  createMandate: (payload: MandateInput) =>
    request<Mandate>(`/api/mandates`, { method: "POST", body: JSON.stringify(payload) }),
  updateMandate: (id: number, payload: Partial<MandateInput>) =>
    request<Mandate>(`/api/mandates/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteMandate: (id: number) => request<{ ok: boolean }>(`/api/mandates/${id}`, { method: "DELETE" }),

  feeEnginePreview: (ccy: string) => request<FeeEnginePreview[]>(`/api/financier/fee-engine/preview?ccy=${ccy}`),
  generateManagementFee: (mandateId: number) =>
    request<Transaction>(`/api/financier/fee-engine/generate/${mandateId}`, { method: "POST" }),
  crystallizePerformanceFee: (mandateId: number) =>
    request<Transaction>(`/api/financier/fee-engine/crystallize/${mandateId}`, { method: "POST" }),

  complianceDocuments: (params?: { status?: string; client_id?: number }) => {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.client_id) q.set("client_id", String(params.client_id));
    const qs = q.toString();
    return request<ComplianceDocument[]>(`/api/compliance/documents${qs ? `?${qs}` : ""}`);
  },
  complianceSummary: () => request<ComplianceSummary>(`/api/compliance/summary`),
  renewDocument: (id: number, validity_days = 365) =>
    request<ComplianceDocument>(`/api/compliance/documents/${id}/renew`, {
      method: "PATCH",
      body: JSON.stringify({ validity_days }),
    }),

  crmContacts: () => request<CrmContact[]>(`/api/crm/contacts`),
  createCrmContact: (payload: Partial<CrmContact> & { name: string }) =>
    request<CrmContact>(`/api/crm/contacts`, { method: "POST", body: JSON.stringify(payload) }),
  updateCrmContact: (id: number, payload: Partial<CrmContact>) =>
    request<CrmContact>(`/api/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteCrmContact: (id: number) => request<{ ok: boolean }>(`/api/crm/contacts/${id}`, { method: "DELETE" }),

  watchlist: () => request<WatchlistItem[]>(`/api/market/watchlist`),
  addWatchlistItem: (payload: Partial<WatchlistItem> & { ticker: string; name: string; last_price: number }) =>
    request<WatchlistItem>(`/api/market/watchlist`, { method: "POST", body: JSON.stringify(payload) }),
  removeWatchlistItem: (id: number) =>
    request<{ ok: boolean }>(`/api/market/watchlist/${id}`, { method: "DELETE" }),
  updateWatchlistItem: (id: number, payload: { data_symbol?: string | null; target_price?: number | null; notes?: string; tags?: string }) =>
    request<WatchlistItem>(`/api/market/watchlist/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  news: () => request<NewsItem[]>(`/api/market/news`),

  earnings: (upcomingOnly = false) =>
    request<EarningsEvent[]>(`/api/market/earnings${upcomingOnly ? "?upcoming_only=true" : ""}`),
  toggleEarningsAlert: (id: number, alert_enabled: boolean) =>
    request<EarningsEvent>(`/api/market/earnings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ alert_enabled }),
    }),

  reference: (category?: string) =>
    request<ReferenceEntry[]>(`/api/reference${category ? `?category=${category}` : ""}`),

  users: () => request<User[]>(`/api/users`),
  createUser: (payload: UserInput) => request<User>(`/api/users`, { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id: number, payload: Partial<UserInput>) =>
    request<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteUser: (id: number) => request<{ ok: boolean }>(`/api/users/${id}`, { method: "DELETE" }),
  setUserPassword: (id: number, new_password: string) =>
    request<User>(`/api/users/${id}/password`, { method: "PATCH", body: JSON.stringify({ new_password }) }),

  allocation: (ccy: string) => request<AllocationResult>(`/api/allocation?ccy=${ccy}`),

  fxRates: () => request<FXRate[]>(`/api/fx/rates`),
  fxCurrencies: () => request<string[]>(`/api/fx/currencies`),

  portfolioTrades: (portfolioId: number) => request<Trade[]>(`/api/portfolios/${portfolioId}/trades`),
  portfolioAnalytics: (portfolioId: number, ccy: string, period = "1y", benchmark = "^GSPC") =>
    request<PortfolioAnalytics>(
      `/api/portfolios/${portfolioId}/analytics?ccy=${ccy}&period=${period}&benchmark=${encodeURIComponent(benchmark)}`
    ),

  syncStatus: () => request<SyncStatus>(`/api/sync/status`),
  triggerIbkrSync: () => request<SyncLog>(`/api/sync/ibkr`, { method: "POST" }),
  triggerMarketRefresh: () => request<SyncLog>(`/api/sync/market-data`, { method: "POST" }),
  triggerBackup: () => request<SyncLog>(`/api/sync/backup`, { method: "POST" }),
  triggerEarningsSync: () => request<SyncLog>(`/api/sync/earnings`, { method: "POST" }),
  auditLogs: (limit = 200) => request<AuditLog[]>(`/api/audit?limit=${limit}`),

  ibkrConnections: () => request<IbkrConnection[]>(`/api/sync/ibkr-connections`),
  createIbkrConnection: (payload: { label: string; token: string; query_id: string }) =>
    request<IbkrConnection>(`/api/sync/ibkr-connections`, { method: "POST", body: JSON.stringify(payload) }),
  deleteIbkrConnection: (id: string) =>
    request<{ ok: boolean }>(`/api/sync/ibkr-connections/${id}`, { method: "DELETE" }),
  testIbkrConnection: (id: string) =>
    request<IbkrTestResult>(`/api/sync/ibkr-connections/${id}/test`, { method: "POST" }),

  marketsOverview: () => request<MarketGroup[]>(`/api/securities/markets`),
  liveNews: () => request<LiveNewsItem[]>(`/api/securities/news`),
  securitiesSearch: (q: string) =>
    request<SecuritySearchResult>(`/api/securities/search?q=${encodeURIComponent(q)}`),
  securitiesTape: () => request<TapeQuote[]>(`/api/securities/tape`),
  securityMetrics: (symbols: string[]) =>
    request<Record<string, Record<string, number | string | null>>>(
      `/api/securities/metrics?symbols=${encodeURIComponent(symbols.join(","))}`
    ),
  portfolioReport: (positionIds: number[], period: string) =>
    request<PortfolioReport>(`/api/reports/portfolio`, {
      method: "POST",
      body: JSON.stringify({ position_ids: positionIds, period }),
    }),
  securityQuote: (symbol: string) => request<SecurityQuote>(`/api/securities/${encodeURIComponent(symbol)}/quote`),
  securityChart: (symbol: string, range: string) =>
    request<SecurityChart>(`/api/securities/${encodeURIComponent(symbol)}/chart?range=${range}`),
  securityOverview: (symbol: string) =>
    request<SecurityOverview>(`/api/securities/${encodeURIComponent(symbol)}/overview`),
  taurusSignal: (symbol: string) =>
    request<TaurusSignal>(`/api/securities/${encodeURIComponent(symbol)}/taurus-signal`),
  momentumSignal: (symbol: string) =>
    request<MomentumSignal>(`/api/securities/${encodeURIComponent(symbol)}/momentum`),
  securityNotes: (symbol: string) =>
    request<SecurityNote[]>(`/api/securities/${encodeURIComponent(symbol)}/notes`),
  createSecurityNote: (symbol: string, body: string) =>
    request<SecurityNote>(`/api/securities/${encodeURIComponent(symbol)}/notes`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  deleteSecurityNote: (noteId: number) =>
    request<void>(`/api/securities/notes/${noteId}`, { method: "DELETE" }),

  riskSettings: () => request<RiskSettings>(`/api/risk/settings`),
  updateRiskSettings: (payload: Partial<RiskSettings>) =>
    request<RiskSettings>(`/api/risk/settings`, { method: "PATCH", body: JSON.stringify(payload) }),
  riskCheck: (payload: { symbol: string; amount: number; currency?: string; price?: number | null; sector?: string | null }) =>
    request<RiskCheckResult>(`/api/risk/check`, { method: "POST", body: JSON.stringify(payload) }),

  aumTargets: (ccy: string) => request<AumTarget[]>(`/api/financier/aum-targets?ccy=${ccy}`),
  createAumTarget: (payload: AumTargetInput, ccy = "EUR") =>
    request<AumTarget>(`/api/financier/aum-targets?ccy=${ccy}`, { method: "POST", body: JSON.stringify(payload) }),
  updateAumTarget: (id: number, payload: Partial<AumTargetInput>, ccy = "EUR") =>
    request<AumTarget>(`/api/financier/aum-targets/${id}?ccy=${ccy}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteAumTarget: (id: number) => request<{ ok: boolean }>(`/api/financier/aum-targets/${id}`, { method: "DELETE" }),
};
