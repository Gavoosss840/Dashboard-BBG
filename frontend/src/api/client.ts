import type {
  AllocationResult,
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
  Mandate,
  MandateInput,
  NewsItem,
  Portfolio,
  PortfolioInput,
  Position,
  PositionInput,
  ReferenceEntry,
  Transaction,
  User,
  UserInput,
  WatchlistItem,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status} on ${path}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  dashboard: (ccy: string) => request<Dashboard>(`/api/dashboard?ccy=${ccy}`),

  clients: (ccy: string) => request<ClientSummary[]>(`/api/clients?ccy=${ccy}`),
  client: (id: number, ccy: string) => request<Client>(`/api/clients/${id}?ccy=${ccy}`),
  createClient: (payload: ClientInput, ccy = "EUR") =>
    request<Client>(`/api/clients?ccy=${ccy}`, { method: "POST", body: JSON.stringify(payload) }),
  updateClient: (id: number, payload: Partial<ClientInput>, ccy = "EUR") =>
    request<Client>(`/api/clients/${id}?ccy=${ccy}`, { method: "PATCH", body: JSON.stringify(payload) }),
  deleteClient: (id: number) => request<{ ok: boolean }>(`/api/clients/${id}`, { method: "DELETE" }),

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

  allocation: (ccy: string) => request<AllocationResult>(`/api/allocation?ccy=${ccy}`),

  fxRates: () => request<FXRate[]>(`/api/fx/rates`),
  fxCurrencies: () => request<string[]>(`/api/fx/currencies`),
};
