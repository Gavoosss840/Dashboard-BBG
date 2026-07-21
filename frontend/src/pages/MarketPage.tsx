import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDateTime, formatMoney, formatPct } from "../lib/format";
import { MetricColumnPicker, useMetrics, useMetricColumns } from "../components/MetricColumns";
import { METRIC_BY_KEY, formatMetric } from "../lib/metrics";

export function MarketPage() {
  const [tab, setTab] = useState<"watchlist" | "news">("watchlist");
  const watchlist = useApi(() => api.watchlist(), []);
  const news = useApi(() => api.liveNews(), []);
  const [metricCols, setMetricCols] = useMetricColumns("watchlist", ["market_cap", "trailing_pe", "dividend_yield"]);
  const watchSymbols = (watchlist.data ?? []).map((w) => w.data_symbol ?? w.ticker);
  const metrics = useMetrics(watchSymbols, tab === "watchlist" && watchSymbols.length > 0);
  const [newTicker, setNewTicker] = useState("");
  const [newDataSymbol, setNewDataSymbol] = useState("");
  const [adding, setAdding] = useState(false);

  async function remove(id: number) {
    await api.removeWatchlistItem(id);
    watchlist.reload();
  }

  async function addTicker() {
    const ticker = newTicker.trim().toUpperCase();
    if (!ticker) return;
    setAdding(true);
    try {
      await api.addWatchlistItem({
        ticker,
        data_symbol: newDataSymbol.trim() || null,
        name: ticker,
        last_price: 0,
      } as never);
      setNewTicker("");
      setNewDataSymbol("");
      watchlist.reload();
    } finally {
      setAdding(false);
    }
  }

  async function editDataSymbol(id: number, current: string | null) {
    const value = window.prompt(
      "Symbole Yahoo Finance pour cette valeur (ex: 0700.HK, MC.PA, NESN.SW). Vide = utiliser le ticker tel quel.",
      current ?? ""
    );
    if (value === null) return;
    await api.updateWatchlistItem(id, { data_symbol: value.trim() || null });
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
        <Card
          action={
            <div className="flex items-center gap-2">
              <MetricColumnPicker tableKey="watchlist" selected={metricCols} onChange={setMetricCols} />
              <input
                value={newTicker}
                onChange={(e) => setNewTicker(e.target.value)}
                placeholder="Ticker (ex: AAPL)"
                className="w-32 rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
              />
              <input
                value={newDataSymbol}
                onChange={(e) => setNewDataSymbol(e.target.value)}
                placeholder="Symbole data (opt.)"
                className="w-36 rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
              />
              <button
                onClick={addTicker}
                disabled={adding}
                className="rounded bg-[var(--series-1)] px-3 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {adding ? "…" : "+ Ajouter"}
              </button>
            </div>
          }
          title="Watchlist"
        >
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
                  {metricCols.map((k) => (
                    <th key={k} className="pb-2 text-right" title={METRIC_BY_KEY[k]?.full}>
                      {METRIC_BY_KEY[k]?.label ?? k}
                    </th>
                  ))}
                  <th className="pb-2">Symbole data</th>
                  <th className="pb-2">Ajouté par</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {watchlist.data.map((w) => (
                  <tr key={w.id} className="border-t border-white/5">
                    <td className="py-2 font-medium">
                      <Link
                        to={`/security/${encodeURIComponent(w.data_symbol ?? w.ticker)}`}
                        className="hover:text-[var(--series-1)] hover:underline"
                      >
                        {w.ticker}
                      </Link>
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{w.name}</td>
                    <td className="py-2 capitalize text-[var(--text-secondary)]">{w.asset_class}</td>
                    <td className="tabular py-2 text-right">{formatMoney(w.last_price, w.currency)}</td>
                    <td
                      className="tabular py-2 text-right"
                      style={{ color: w.day_change_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                    >
                      {formatPct(w.day_change_pct)}
                    </td>
                    {metricCols.map((k) => {
                      const def = METRIC_BY_KEY[k];
                      const raw = metrics[w.data_symbol ?? w.ticker]?.[k];
                      return (
                        <td key={k} className={`tabular py-2 ${def?.align === "left" ? "text-left" : "text-right"}`}>
                          {def ? formatMetric(raw, def.format) : "—"}
                        </td>
                      );
                    })}
                    <td className="py-2">
                      <button
                        onClick={() => editDataSymbol(w.id, w.data_symbol)}
                        className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                      >
                        {w.data_symbol ?? "définir"}
                      </button>
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
        <Card title="Actualités live (Yahoo Finance, par valeur de la watchlist)">
          {news.loading && <LoadingState />}
          {news.error && <ErrorState message={news.error} />}
          {news.data && news.data.length === 0 && (
            <div className="text-sm text-[var(--text-muted)]">
              Ajoutez des valeurs à la watchlist pour alimenter le fil d'actualités.
            </div>
          )}
          {news.data && news.data.length > 0 && (
            <div className="divide-y divide-white/5">
              {news.data.map((n, i) => (
                <a
                  key={i}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-3 first:pt-0 last:pb-0 hover:bg-white/[0.03]"
                >
                  <div className="font-medium">{n.title}</div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    <span className="text-[var(--series-1)]">{n.symbol}</span> · {n.publisher}
                    {n.published_at != null && ` · ${formatDateTime(new Date(n.published_at * 1000).toISOString())}`}
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
