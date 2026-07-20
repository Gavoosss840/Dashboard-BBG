import type { TaurusDetail, Valuation } from "../api/types";
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

function compact(v: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v)} ${currency}`;
}

function MmRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex justify-between gap-3 border-t border-white/5 py-1 first:border-t-0 text-sm" title={hint}>
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular text-right">{value}</span>
    </div>
  );
}

function TaurusBreakdown({ t, currency }: { t: TaurusDetail; currency: string }) {
  const m = t.momentum;
  return (
    <div className="rounded-lg border border-[var(--series-1)]/25 bg-[var(--series-1)]/[0.05] p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--series-1)]">
        Décomposition Modigliani-Miller
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <div>
          <MmRow label="Valeur théorique (VL)" value={compact(t.vl_theoretical, currency)} hint="VE − détresse − agence" />
          <MmRow label="Valeur d'entreprise" value={compact(t.enterprise_value, currency)} />
          <MmRow label="Dette nette" value={compact(t.net_debt, currency)} />
          <MmRow label="Bouclier fiscal (PV)" value={compact(t.pv_tax_shield, currency)} />
          <MmRow
            label="Coût de détresse (PV)"
            value={compact(t.pv_distress, currency)}
            hint={`P(défaut) × taux distress secteur ${(t.distress_rate * 100).toFixed(0)}% × VE`}
          />
          <MmRow label="Coût d'agence (PV)" value={compact(t.pv_agency, currency)} />
        </div>
        <div>
          <MmRow label="Probabilité de défaut (Merton)" value={`${(t.prob_default * 100).toFixed(2)}%`} hint="Modèle de Merton, queue Student-t (ν=5)" />
          <MmRow label="Spread de crédit estimé" value={`${(t.credit_spread * 100).toFixed(2)}%`} />
          <MmRow label="Levier D/E" value={formatNumber(t.leverage_ratio, 2)} />
          <MmRow label="Couverture des intérêts" value={t.ic_ratio != null ? `${formatNumber(t.ic_ratio, 1)}×` : "n/a"} />
          <MmRow label="Volatilité (actions / actifs)" value={t.sigma_equity != null ? `${(t.sigma_equity * 100).toFixed(0)}% / ${(t.sigma_assets * 100).toFixed(0)}%` : "—"} />
          {m && (
            <MmRow
              label="Momentum vol-ajusté (12M‑1M)"
              value={m.mom_sharpe != null ? `${formatPct(m.mom_raw * 100, 0)} · Sharpe ${formatNumber(m.mom_sharpe, 2)}` : formatPct(m.mom_raw * 100, 0)}
              hint="Jegadeesh-Titman / Barroso-Santa-Clara"
            />
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {t.underleveraged && (
          <span className="rounded bg-[var(--status-good)]/15 px-2 py-0.5 text-[11px] text-[var(--status-good)]">
            Sous-évalué / sous-endetté → biais LONG
          </span>
        )}
        {t.overleveraged && (
          <span className="rounded bg-[var(--status-critical)]/15 px-2 py-0.5 text-[11px] text-[var(--status-critical)]">
            Surévalué / sur-endetté → biais SHORT
          </span>
        )}
        {m && m.mom_sharpe != null && (
          <span
            className="rounded px-2 py-0.5 text-[11px]"
            style={{
              background: "rgba(255,255,255,0.06)",
              color: m.mom_raw >= 0 ? "var(--status-good)" : "var(--status-critical)",
            }}
          >
            Tendance {m.mom_raw >= 0 ? "haussière" : "baissière"}
          </span>
        )}
      </div>
    </div>
  );
}

export function ValuationCard({ valuation, currency }: { valuation: Valuation; currency: string }) {
  const v = valuation;
  const verdict = VERDICT[v.verdict];
  const isTaurus = v.model === "taurus";
  const pos = ((Math.min(Math.max(v.upside_pct, GAUGE_MIN), GAUGE_MAX) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100;

  return (
    <Card
      title={isTaurus ? "Valorisation Taurus — sur/sous-évaluation (MM)" : "Valorisation — sur/sous-évaluation instantanée"}
      action={
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{
            background: isTaurus ? "var(--series-1)" : "rgba(255,255,255,0.08)",
            color: isTaurus ? "#fff" : "var(--text-muted)",
          }}
          title={
            isTaurus
              ? "Moteur Modigliani-Miller de la stratégie Taurus (port fidèle du repo)"
              : "Modèle standard transparent — Taurus indisponible pour cet instrument"
          }
        >
          {isTaurus ? "⬢ Algo Taurus" : "Modèle standard"}
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
            <span>Juste valeur (seuil ±{v.threshold_pct.toFixed(0)}%)</span>
            <span>Sous-évalué (+50%)</span>
          </div>
        </div>

        {isTaurus && v.taurus ? (
          <TaurusBreakdown t={v.taurus} currency={currency} />
        ) : (
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
        )}

        <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          {isTaurus
            ? "Moteur MM de Taurus : valeur théorique = valeur d'entreprise − coûts de détresse (Merton) − coûts d'agence. La divergence donne le sur/sous-évaluation. Aide à la décision interne — pas un conseil d'investissement."
            : "Survolez un composant pour le détail du calcul. Aide à la décision interne — pas un conseil d'investissement."}
        </div>
      </div>
    </Card>
  );
}
