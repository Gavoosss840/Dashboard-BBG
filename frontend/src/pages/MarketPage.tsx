import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDateTime, formatMoney, formatPct } from "../lib/format";

const SENTIMENT_COLOR: Record<string, string> = {
  positive: "var(--status-good)",
  negative: "var(--status-critical)",
  neutral: "var(--text-muted)",
};

export function MarketPage() {
  const [tab, setTab] = useState<"watchlist" | "news">("watchlist");
  const watchlist = useApi(() => api.watchlist(), []);
  const news = useApi(() => api.news(), []);

  async function remove(id: number) {
    await api.removeWatchlistItem(id);
    watchlist.reload();
  }

  return (
    <div>
      <PageHeader
        title="Market"
        subtitle="Watchlist & actualités"
        action={
          <div className="flex gap-1">
            {(["watchlist", "news"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 text-sm capitalize ${
                  tab === t ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {t === "watchlist" ? "Watchlist" : "News"}
              </button>
            ))}
          </div>
        }
      />

      {tab === "watchlist" && (
        <Card>
          {watchlist.loading && <LoadingState />}
          {watchlist.error && <ErrorState message={watchlist.error} />}
          {watchlist.data && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                  <th className="pb-2">Ticker</th>
                  <th className="pb-2">Nom</th>
                  <th className="pb-2">Classe</th>
                  <th className="pb-2 text-right">Dernier prix</th>
                  <th className="pb-2 text-right">Variation jour</th>
                  <th className="pb-2">Ajouté par</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((w) => (
                  <tr key={w.id} className="border-t border-white/5">
                    <td className="py-2 font-medium">{w.ticker}</td>
                    <td className="py-2 text-[var(--text-secondary)]">{w.name}</td>
                    <td className="py-2 capitalize text-[var(--text-secondary)]">{w.asset_class}</td>
                    <td className="tabular py-2 text-right">{formatMoney(w.last_price, w.currency)}</td>
                    <td
                      className="tabular py-2 text-right"
                      style={{ color: w.day_change_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                    >
                      {formatPct(w.day_change_pct)}
                    </td>
                    <td className="py-2 text-[var(--text-muted)]">{w.added_by?.name ?? "—"}</td>
                    <td className="py-2 text-right">
                      <button onClick={() => remove(w.id)} className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]">
                        retirer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === "news" && (
        <Card>
          {news.loading && <LoadingState />}
          {news.error && <ErrorState message={news.error} />}
          {news.data && (
            <div className="divide-y divide-white/5">
              {news.data.map((n) => (
                <div key={n.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{n.headline}</div>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs capitalize"
                      style={{ background: "rgba(255,255,255,0.05)", color: SENTIMENT_COLOR[n.sentiment] }}
                    >
                      {n.sentiment}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    {n.source} · {formatDateTime(n.published_at)} {n.tickers && `· ${n.tickers}`}
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{n.summary}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
