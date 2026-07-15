import type {
  AllocationResult,
  Client,
  ClientSummary,
  CrmContact,
  Dashboard,
  EarningsEvent,
  FXRate,
  GlobalPortfolio,
  Mandate,
  NewsItem,
  Portfolio,
  ReferenceEntry,
  Transaction,
  User,
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

  globalPortfolio: (ccy: string) => request<GlobalPortfolio>(`/api/portfolios/global?ccy=${ccy}`),
  portfolio: (id: number, ccy: string) => request<Portfolio>(`/api/portfolios/${id}?ccy=${ccy}`),

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

  crmContacts: () => request<CrmContact[]>(`/api/crm/contacts`),
  createCrmContact: (payload: Partial<CrmContact> & { name: string }) =>
    request<CrmContact>(`/api/crm/contacts`, { method: "POST", body: JSON.stringify(payload) }),
  updateCrmContact: (id: number, payload: Partial<CrmContact>) =>
    request<CrmContact>(`/api/crm/contacts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

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

  allocation: (ccy: string) => request<AllocationResult>(`/api/allocation?ccy=${ccy}`),

  fxRates: () => request<FXRate[]>(`/api/fx/rates`),
  fxCurrencies: () => request<string[]>(`/api/fx/currencies`),
};
