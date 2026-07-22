import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { PortfolioReport, Position } from "../api/types";
import { Card } from "./ui/Card";
import { NavChart } from "./charts/NavChart";
import { LoadingState } from "./ui/States";

const PERIODS: { key: string; label: string }[] = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
];

function pct(v: number | null | undefined, sign = false): string {
  if (v === null || v === undefined) return "—";
  return `${sign && v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}
function ratio(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(2);
}

/** Report on a chosen subset of positions: tick lines to include, and NAV,
 * return, vol, Sharpe... recompute from those positions' real price history. */
export function PortfolioReportCard({ positions }: { positions: Position[] }) {
  // Default selection: everything currently counted (not excluded via the
  // position's toggle). Options are included too — the engine reconstructs them
  // via a Black-76 model, and flags them as modeled.
  const defaultSelected = useMemo(
    () => new Set(positions.filter((p) => !p.excluded).map((p) => p.id)),
    [positions]
  );
  const [selected, setSelected] = useState<Set<number>>(defaultSelected);
  const [period, setPeriod] = useState("1y");
  const [report, setReport] = useState<PortfolioReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => setSelected(defaultSelected), [defaultSelected]);

  const ids = useMemo(() => Array.from(selected), [selected]);
  const idsKey = ids.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (ids.length === 0) {
      setReport(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .portfolioReport(ids, period)
      .then((r) => !cancelled && setReport(r))
      .catch(() => !cancelled && setReport(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, period]);

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const m = report?.metrics ?? null;

  return (
    <Card
      title="Rapport de performance (sélection)"
      className="mt-4"
      action={
        <div className="flex gap-1">
          {PERIODS.map((pp) => (
            <button
              key={pp.key}
              onClick={() => setPeriod(pp.key)}
              className={`rounded px-2 py-1 text-xs ${
                period === pp.key ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"
              }`}
            >
              {pp.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        {/* Position selector */}
        <div className="max-h-80 overflow-y-auto rounded border border-white/5 p-2">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>{selected.size} sélectionnée(s)</span>
            <div className="flex gap-2">
              <button className="hover:text-[var(--series-1)]" onClick={() => setSelected(new Set(positions.map((p) => p.id)))}>
                tout
              </button>
              <button className="hover:text-[var(--series-1)]" onClick={() => setSelected(new Set())}>
                aucun
              </button>
            </div>
          </div>
          {positions.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-white/5">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="accent-[var(--series-1)]" />
              <span className="font-medium">{p.ticker}</span>
              <span className="truncate text-xs text-[var(--text-muted)]">{p.name}</span>
            </label>
          ))}
        </div>

        {/* Metrics + chart */}
        <div>
          {loading && <LoadingState />}
          {!loading && !report && <div className="text-sm text-[var(--text-muted)]">Sélectionnez au moins une position.</div>}
          {!loading && report && (
            <>
              {m ? (
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Metric label="Rendement" value={pct(m.total_return, true)} good={m.total_return >= 0} />
                  <Metric label="Rdt annualisé" value={pct(m.annualised_return, true)} good={m.annualised_return >= 0} />
                  <Metric label="Volatilité ann." value={pct(m.annualised_vol)} />
                  <Metric label="Sharpe" value={ratio(m.sharpe)} good={(m.sharpe ?? 0) >= 1} />
                  <Metric label="Sortino" value={ratio(m.sortino)} />
                  <Metric label="Max drawdown" value={pct(m.max_drawdown)} bad />
                  <Metric label="Meilleur jour" value={pct(m.best_day, true)} good />
                  <Metric label="Pire jour" value={pct(m.worst_day, true)} bad />
                </div>
              ) : (
                <div className="mb-3 text-sm text-[var(--text-muted)]">Historique insuffisant pour les métriques.</div>
              )}
              <NavChart data={report.nav_series} ccy={report.currency} />
              {report.included.some((i) => i.modeled) && (
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  <span className="rounded bg-[var(--series-1)]/15 px-1 text-[var(--series-1)]">modélisé (Black-76)</span>{" "}
                  {report.included.filter((i) => i.modeled).map((i) => i.ticker).join(", ")} — valeur d'option reconstruite
                  depuis le sous-jacent réel (pas de prix d'option historique gratuit).
                </div>
              )}
              {report.skipped.length > 0 && (
                <div className="mt-2 text-xs text-[var(--text-muted)]">
                  Exclu(s) du calcul :{" "}
                  {report.skipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}.
                </div>
              )}
              <div className="mt-1 text-[10px] text-[var(--text-muted)]">
                Simulation à partir des prix historiques quotidiens (Yahoo / Black-76 pour les options) et des quantités
                actuelles — Sharpe/Sortino avec taux sans risque à 0.
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function Metric({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const color = good ? "var(--status-good)" : bad ? "var(--status-critical)" : "var(--text-primary)";
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase text-[var(--text-muted)]">{label}</div>
      <div className="tabular text-lg font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
