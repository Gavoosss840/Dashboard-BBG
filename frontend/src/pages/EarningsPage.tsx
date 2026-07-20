import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDate } from "../lib/format";

export function EarningsPage() {
  const { data, loading, error, reload } = useApi(() => api.earnings(), []);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function toggleAlert(id: number, current: boolean) {
    await api.toggleEarningsAlert(id, !current);
    reload();
  }

  async function runSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const log = await api.triggerEarningsSync();
      setSyncMessage(log.message);
      reload();
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="Earnings Calendar"
        subtitle="Calendrier de résultats (dates Yahoo Finance) pour les valeurs de la watchlist"
        action={
          <button
            onClick={runSync}
            disabled={syncing}
            className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {syncing ? "Synchronisation…" : "Synchroniser"}
          </button>
        }
      />

      {syncMessage && (
        <div className="mb-4 rounded border border-[var(--series-1)]/25 bg-[var(--series-1)]/[0.05] px-3 py-2 text-sm text-[var(--text-secondary)]">
          {syncMessage}
        </div>
      )}

      {data.length === 0 ? (
        <Card>
          <div className="py-6 text-center text-sm text-[var(--text-muted)]">
            Aucune date de résultats connue. Le calendrier se remplit à partir des valeurs de la{" "}
            <Link to="/market" className="text-[var(--series-1)] hover:underline">
              watchlist
            </Link>{" "}
            — ajoutes-y des tickers, puis clique <strong>Synchroniser</strong> ci-dessus (ou attends la synchro
            automatique, toutes les 12h). Les indices, ETF et devises n'ont pas de date de résultats.
          </div>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Date</th>
                <th className="pb-2">Ticker</th>
                <th className="pb-2">Société</th>
                <th className="pb-2">Horaire</th>
                <th className="pb-2 text-right">EPS est.</th>
                <th className="pb-2 text-right">EPS réel</th>
                <th className="pb-2 text-right">Revenue est. (M)</th>
                <th className="pb-2 text-right">Revenue réel (M)</th>
                <th className="pb-2">Alerte</th>
              </tr>
            </thead>
            <tbody>
              {data.map((e) => (
                <tr key={e.id} className={`border-t border-white/5 ${e.event_date >= today ? "" : "opacity-60"}`}>
                  <td className="py-2 text-[var(--text-secondary)]">{formatDate(e.event_date)}</td>
                  <td className="py-2 font-medium">
                    <Link
                      to={`/security/${encodeURIComponent(e.ticker)}`}
                      className="hover:text-[var(--series-1)] hover:underline"
                    >
                      {e.ticker}
                    </Link>
                    {e.held_in_portfolio && (
                      <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                        en portefeuille
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-[var(--text-secondary)]">{e.company}</td>
                  <td className="py-2 text-[var(--text-muted)]">{e.time_of_day === "?" ? "—" : e.time_of_day}</td>
                  <td className="tabular py-2 text-right">{e.eps_estimate?.toFixed(2) ?? "—"}</td>
                  <td className="tabular py-2 text-right">{e.eps_actual?.toFixed(2) ?? "—"}</td>
                  <td className="tabular py-2 text-right">{e.revenue_estimate_m?.toFixed(0) ?? "—"}</td>
                  <td className="tabular py-2 text-right">{e.revenue_actual_m?.toFixed(0) ?? "—"}</td>
                  <td className="py-2">
                    <button
                      onClick={() => toggleAlert(e.id, e.alert_enabled)}
                      className={`rounded px-2 py-0.5 text-xs ${
                        e.alert_enabled
                          ? "bg-[var(--status-good)]/15 text-[var(--status-good)]"
                          : "bg-white/5 text-[var(--text-muted)]"
                      }`}
                    >
                      {e.alert_enabled ? "Activée" : "Désactivée"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
