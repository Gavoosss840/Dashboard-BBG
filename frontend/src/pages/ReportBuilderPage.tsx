import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Client, ClientSummary, CashFlow, PortfolioReport } from "../api/types";
import { useCurrency } from "../context/CurrencyContext";
import { PageHeader } from "../components/ui/PageHeader";
import { Card } from "../components/ui/Card";
import { LoadingState } from "../components/ui/States";
import { NavChart } from "../components/charts/NavChart";
import { BreakdownBars } from "../components/charts/BreakdownBars";
import { formatDate, formatMoney, formatNumber } from "../lib/format";

const PERIODS = [
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
];

type SectionKey = "perf" | "positions" | "flows" | "commentary";
const SECTION_LABELS: Record<SectionKey, string> = {
  perf: "Performance & NAV",
  positions: "Positions & allocation",
  flows: "Flux, frais & mandat",
  commentary: "Commentaire du gérant",
};

function pctSigned(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}
function ratio(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(2);
}

export function ReportBuilderPage() {
  const { currency } = useCurrency();
  const clients = useClientList(currency);
  const [clientId, setClientId] = useState<number | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [flows, setFlows] = useState<CashFlow[]>([]);
  const [period, setPeriod] = useState("1y");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [sections, setSections] = useState<Record<SectionKey, boolean>>({
    perf: true, positions: true, flows: true, commentary: true,
  });
  const [title, setTitle] = useState("Rapport de gestion");
  const [commentary, setCommentary] = useState("");

  // Pick the first client by default.
  useEffect(() => {
    if (clientId === null && clients.length > 0) setClientId(clients[0].id);
  }, [clients, clientId]);

  // Load the selected client's detail + flows.
  useEffect(() => {
    if (clientId === null) return;
    setClient(null);
    Promise.all([api.client(clientId, currency), api.cashFlows(clientId)])
      .then(([c, f]) => {
        setClient(c);
        setFlows(f);
        const all = c.portfolios.flatMap((p) => p.positions);
        setSelected(new Set(all.filter((p) => !p.excluded).map((p) => p.id)));
      })
      .catch(() => setClient(null));
  }, [clientId, currency]);

  const allPositions = useMemo(() => (client ? client.portfolios.flatMap((p) => p.positions) : []), [client]);
  const ids = useMemo(() => Array.from(selected), [selected]);
  const idsKey = ids.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (ids.length === 0) { setReport(null); return; }
    let cancelled = false;
    setLoadingReport(true);
    api.portfolioReport(ids, period)
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setReport(null))
      .finally(() => !cancelled && setLoadingReport(false));
    return () => { cancelled = true; };
  }, [idsKey, period]);

  function toggle(id: number) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const mandate = client?.mandates?.[0];
  const m = report?.metrics ?? null;

  // Allocation by asset class over the selected positions.
  const allocation = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of allPositions) {
      if (!selected.has(p.id)) continue;
      out[p.asset_class] = (out[p.asset_class] ?? 0) + p.market_value;
    }
    return out;
  }, [allPositions, selected]);

  const selectedPnl = useMemo(
    () => allPositions.filter((p) => selected.has(p.id)).reduce((a, p) => a + p.unrealized_pnl, 0),
    [allPositions, selected]
  );

  return (
    <div>
      <PageHeader
        title="Report client"
        subtitle="Construire un rapport de gestion — sélection de titres, composantes, export"
        action={
          <button
            onClick={() => window.print()}
            disabled={!client}
            className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Imprimer / PDF
          </button>
        }
      />

      {/* ---- Configuration (not printed) ---- */}
      <div data-print="hide">
      <Card title="Configuration du rapport" className="mb-4">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div>
            <label className="mb-1 block text-xs uppercase text-[var(--text-muted)]">Client</label>
            <select
              value={clientId ?? ""}
              onChange={(e) => setClientId(Number(e.target.value))}
              className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <label className="mb-1 mt-3 block text-xs uppercase text-[var(--text-muted)]">Titre du rapport</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm"
            />
            <label className="mb-1 mt-3 block text-xs uppercase text-[var(--text-muted)]">Période</label>
            <div className="flex gap-1">
              {PERIODS.map((pp) => (
                <button key={pp.key} onClick={() => setPeriod(pp.key)}
                  className={`rounded px-2 py-1 text-xs ${period === pp.key ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"}`}>
                  {pp.label}
                </button>
              ))}
            </div>
            <label className="mb-1 mt-3 block text-xs uppercase text-[var(--text-muted)]">Sections incluses</label>
            <div className="flex flex-wrap gap-3">
              {(Object.keys(SECTION_LABELS) as SectionKey[]).map((k) => (
                <label key={k} className="flex items-center gap-1.5 text-sm">
                  <input type="checkbox" checked={sections[k]} onChange={() => setSections((s) => ({ ...s, [k]: !s[k] }))} className="accent-[var(--series-1)]" />
                  {SECTION_LABELS[k]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase text-[var(--text-muted)]">
              Titres inclus ({selected.size}/{allPositions.length}) — décocher = « comme si jamais détenu »
            </label>
            <div className="max-h-56 overflow-y-auto rounded border border-white/5 p-2">
              {allPositions.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-white/5">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--series-1)]" />
                  <span className="font-medium">{p.ticker}</span>
                  <span className="truncate text-xs text-[var(--text-muted)]">{p.name}</span>
                </label>
              ))}
              {allPositions.length === 0 && <div className="text-sm text-[var(--text-muted)]">Aucune position.</div>}
            </div>
          </div>
        </div>
      </Card>
      </div>

      {/* ---- The report itself (printable) ---- */}
      {!client ? (
        <LoadingState />
      ) : (
        <div className="report-print-area space-y-4">
          {/* Header */}
          <Card className="report-card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xl font-semibold">{title}</div>
                <div className="mt-1 text-[var(--text-secondary)]">
                  {client.name} · Client #{client.id} · {mandate?.mandate_type ?? "—"}
                </div>
              </div>
              <div className="text-right text-sm text-[var(--text-secondary)]">
                <div>Période : {PERIODS.find((p) => p.key === period)?.label}</div>
                <div>Devise : {currency}</div>
                <div>Édité le {formatDate(new Date().toISOString())}</div>
              </div>
            </div>
          </Card>

          {/* Perf + NAV */}
          {sections.perf && (
            <Card title="Performance & évolution de la NAV" className="report-card">
              {loadingReport && <LoadingState />}
              {!loadingReport && (
                <>
                  {m && (
                    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Metric label="Rendement" value={pctSigned(m.total_return)} good={m.total_return >= 0} />
                      <Metric label="Rdt annualisé" value={pctSigned(m.annualised_return)} good={m.annualised_return >= 0} />
                      <Metric label="Volatilité ann." value={`${(m.annualised_vol * 100).toFixed(1)}%`} />
                      <Metric label="Sharpe" value={ratio(m.sharpe)} good={(m.sharpe ?? 0) >= 1} />
                      <Metric label="Sortino" value={ratio(m.sortino)} />
                      <Metric label="Max drawdown" value={pctSigned(m.max_drawdown)} bad />
                      <Metric label="NAV actuelle" value={formatMoney(client.current_nav, currency, { compact: true })} />
                      <Metric label="P&L latent (sélection)" value={formatMoney(selectedPnl, currency, { compact: true })} good={selectedPnl >= 0} />
                    </div>
                  )}
                  {report && report.nav_series.length > 0 && <NavChart data={report.nav_series} ccy={currency} />}
                  {report && report.modeled_removals?.length > 0 && (
                    <div className="mt-2 text-xs text-[var(--text-muted)]">
                      Retrait modélisé Black-76 : {report.modeled_removals.map((i) => i.ticker).join(", ")}.
                    </div>
                  )}
                  {report && report.skipped.length > 0 && (
                    <div className="mt-1 text-xs text-[var(--status-warning)]">
                      Non retiré(s) de la courbe : {report.skipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}.
                    </div>
                  )}
                  {report && (
                    <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                      {report.basis === "real"
                        ? "NAV réelle du compte IBKR moins la contribution en P&L des lignes décochées — performance pondérée dans le temps (hors dépôts/retraits)."
                        : "Portefeuille sans NAV synchronisée : simulation aux quantités actuelles, pas la performance réelle du compte."}
                    </div>
                  )}
                </>
              )}
            </Card>
          )}

          {/* Positions + allocation */}
          {sections.positions && (
            <Card title="Positions & allocation" className="report-card">
              <div className="mb-4">
                <BreakdownBars data={allocation} ccy={currency} />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                    <th className="pb-2">Ticker</th><th className="pb-2">Nom</th><th className="pb-2 text-right">Qté</th>
                    <th className="pb-2 text-right">Prix moyen</th><th className="pb-2 text-right">Dernier</th>
                    <th className="pb-2 text-right">Valeur</th><th className="pb-2 text-right">P&L latent</th>
                  </tr>
                </thead>
                <tbody>
                  {allPositions.filter((p) => selected.has(p.id)).map((p) => (
                    <tr key={p.id} className="border-t border-white/5">
                      <td className="py-1.5 font-medium">{p.ticker}</td>
                      <td className="py-1.5 text-[var(--text-secondary)]">{p.name}</td>
                      <td className="tabular py-1.5 text-right">{formatNumber(p.quantity, 2)}</td>
                      <td className="tabular py-1.5 text-right">{formatMoney(p.avg_cost, p.currency)}</td>
                      <td className="tabular py-1.5 text-right">{formatMoney(p.last_price, p.currency)}</td>
                      <td className="tabular py-1.5 text-right">{formatMoney(p.market_value, currency, { compact: true })}</td>
                      <td className="tabular py-1.5 text-right" style={{ color: p.unrealized_pnl >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                        {formatMoney(p.unrealized_pnl, currency, { compact: true })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Flows + fees + mandate */}
          {sections.flows && (
            <Card title="Flux, frais & mandat" className="report-card">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-2 text-xs uppercase text-[var(--text-muted)]">Dépôts / retraits</div>
                  <div className="flex justify-between text-sm"><span>Total dépôts</span><span className="tabular">{formatMoney(client.total_deposits, currency)}</span></div>
                  <div className="flex justify-between text-sm"><span>Total retraits</span><span className="tabular">{formatMoney(client.total_withdrawals, currency)}</span></div>
                  <div className="flex justify-between text-sm font-medium"><span>Dépôts nets</span><span className="tabular">{formatMoney(client.net_deposits, currency)}</span></div>
                  <div className="mt-2 max-h-32 overflow-y-auto text-xs text-[var(--text-secondary)]">
                    {flows.slice(0, 8).map((f) => (
                      <div key={f.id} className="flex justify-between">
                        <span>{formatDate(f.date)} · {f.flow_type === "deposit" ? "Dépôt" : "Retrait"}</span>
                        <span className="tabular">{formatMoney(f.amount, f.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase text-[var(--text-muted)]">Mandat</div>
                  {mandate ? (
                    <div className="space-y-1 text-sm">
                      <Row k="Type" v={mandate.mandate_type} />
                      <Row k="Frais de gestion" v={`${mandate.mgmt_fee_pct}%`} />
                      <Row k="Frais de perf." v={`${mandate.perf_fee_pct}%`} />
                      <Row k="Hurdle" v={`${mandate.hurdle_rate_pct}%`} />
                      <Row k="High-water mark" v={formatMoney(mandate.high_water_mark, currency)} />
                      <Row k="Benchmark" v={mandate.benchmark || "—"} />
                      <Row k="TWR YTD" v={pctSigned(client.twr_ytd)} />
                      <Row k="TWR depuis origine" v={pctSigned(client.twr_since_inception)} />
                    </div>
                  ) : <div className="text-sm text-[var(--text-muted)]">Aucun mandat.</div>}
                </div>
              </div>
            </Card>
          )}

          {/* Commentary */}
          {sections.commentary && (
            <Card title="Commentaire du gérant" className="report-card">
              <textarea
                value={commentary}
                onChange={(e) => setCommentary(e.target.value)}
                placeholder="Commentaire de gestion, contexte de marché, perspectives…"
                className="min-h-[120px] w-full rounded border border-white/10 bg-[var(--surface-2)] p-2 text-sm print:border-none print:bg-transparent"
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const color = good ? "var(--status-good)" : bad ? "var(--status-critical)" : "var(--text-primary)";
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase text-[var(--text-muted)]">{label}</div>
      <div className="tabular text-lg font-medium" style={{ color }}>{value}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-[var(--text-muted)]">{k}</span><span className="tabular">{v}</span></div>;
}

function useClientList(currency: string): ClientSummary[] {
  const [list, setList] = useState<ClientSummary[]>([]);
  useEffect(() => {
    api.clients(currency).then(setList).catch(() => setList([]));
  }, [currency]);
  return list;
}
