import type { Valuation } from "../api/types";
import { Card } from "./ui/Card";
import { formatNumber, formatPct } from "../lib/format";

const VERDICT: Record<Valuation["verdict"], { label: string; color: string }> = {
  undervalued: { label: "SOUS-ÉVALUÉ", color: "var(--status-good)" },
  fair: { label: "CORRECTEMENT VALORISÉ", color: "var(--status-warning)" },
  overvalued: { label: "SURÉVALUÉ", color: "var(--status-critical)" },
};

// gauge spans -50%…+50% of upside; beyond that the needle pins to the edge
const GAUGE_MIN = -50;
const GAUGE_MAX = 50;

export function ValuationCard({ valuation, currency }: { valuation: Valuation; currency: string }) {
  const v = valuation;
  const verdict = VERDICT[v.verdict];
  const pos = ((Math.min(Math.max(v.upside_pct, GAUGE_MIN), GAUGE_MAX) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;

  return (
    <Card
      title="Valorisation — sur/sous-évaluation instantanée"
      action={
        <span
          className="rounded px-2 py-0.5 text-[10px] uppercase tracking-wider"
          style={{
            background: v.model === "taurus" ? "var(--series-1)" : "rgba(255,255,255,0.08)",
            color: v.model === "taurus" ? "#fff" : "var(--text-muted)",
          }}
          title={
            v.model === "taurus"
              ? "Calculé avec l'algo Taurus"
              : "Modèle standard transparent — sera remplacé par les formules Taurus"
          }
        >
          {v.model === "taurus" ? "Algo Taurus" : "Modèle standard (Taurus à venir)"}
        </span>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Verdict</div>
            <div className="text-lg font-bold" style={{ color: verdict.color }}>
              {verdict.label}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Juste valeur estimée</div>
            <div className="tabular text-lg font-semibold">
              {formatNumber(v.fair_value)} {currency}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              {v.upside_pct >= 0 ? "Potentiel de hausse" : "Risque de baisse"}
            </div>
            <div className="tabular text-lg font-semibold" style={{ color: verdict.color }}>
              {formatPct(v.upside_pct, 1)}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Confiance</div>
            <div className="text-lg font-semibold capitalize">{v.confidence}</div>
          </div>
        </div>

        {/* gauge: red (overvalued) → yellow (fair) → green (undervalued) */}
        <div>
          <div
            className="relative h-2.5 w-full rounded"
            style={{
              background:
                "linear-gradient(90deg, var(--status-critical) 0%, var(--status-critical) 30%, var(--status-warning) 42%, var(--status-warning) 58%, var(--status-good) 70%, var(--status-good) 100%)",
              opacity: 0.85,
            }}
          >
            <div
              className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--surface-0)] shadow"
              style={{ left: `${pos}%` }}
              title={`Écart à la juste valeur: ${formatPct(v.upside_pct, 1)}`}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)]">
            <span>Surévalué (−50%)</span>
            <span>Juste valeur</span>
            <span>Sous-évalué (+50%)</span>
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
              <th className="pb-1.5">Composant</th>
              <th className="pb-1.5 text-right">Juste valeur</th>
              <th className="pb-1.5 text-right">Écart</th>
              <th className="pb-1.5 text-right">Poids</th>
            </tr>
          </thead>
          <tbody>
            {v.components.map((c) => (
              <tr key={c.key} className="border-t border-white/5" title={c.detail}>
                <td className="py-1.5">{c.label}</td>
                <td className="tabular py-1.5 text-right">{formatNumber(c.fair_value)}</td>
                <td
                  className="tabular py-1.5 text-right"
                  style={{ color: c.upside_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                >
                  {formatPct(c.upside_pct, 1)}
                </td>
                <td className="tabular py-1.5 text-right text-[var(--text-muted)]">
                  {Math.round((c.weight / v.components.reduce((s, x) => s + x.weight, 0)) * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          Survolez un composant pour le détail du calcul. Aide à la décision interne — pas un conseil
          d'investissement.
        </div>
      </div>
    </Card>
  );
}
