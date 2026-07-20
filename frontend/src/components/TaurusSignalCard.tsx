import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { TaurusSignal } from "../api/types";
import { Card } from "./ui/Card";
import { formatNumber, formatPct } from "../lib/format";

const STANCE: Record<string, { label: string; color: string }> = {
  LONG: { label: "LONG", color: "var(--status-good)" },
  SHORT: { label: "SHORT", color: "var(--status-critical)" },
  NEUTRE: { label: "NEUTRE", color: "var(--status-warning)" },
};

const FACTOR_LABEL: Record<string, string> = {
  "Mkt-RF": "Marché",
  SMB: "Taille (SMB)",
  HML: "Value (HML)",
  RMW: "Qualité (RMW)",
  CMA: "Investissement (CMA)",
  UMD: "Momentum (UMD)",
};

// z-score bar centered on 0, spanning ±3
function ZBar({ label, weight, z }: { label: string; weight: number; z: number | null | undefined }) {
  const val = z ?? 0;
  const pct = ((Math.min(Math.max(val, -3), 3) + 3) / 6) * 100;
  const color = val >= 0 ? "var(--status-good)" : "var(--status-critical)";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-[var(--text-secondary)]">
          {label} <span className="text-[var(--text-muted)]">· poids {Math.round(weight * 100)}%</span>
        </span>
        <span className="tabular font-medium" style={{ color: z == null ? "var(--text-muted)" : color }}>
          {z == null ? "n/a" : `z ${formatNumber(val, 2)}`}
        </span>
      </div>
      <div className="relative h-2 w-full rounded bg-[var(--surface-3)]">
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
        {z != null && (
          <div
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${pct}%`, background: color }}
          />
        )}
      </div>
    </div>
  );
}

export function TaurusSignalCard({ symbol }: { symbol: string }) {
  const [signal, setSignal] = useState<TaurusSignal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setSignal(null);

    async function load() {
      try {
        const s = await api.taurusSignal(symbol);
        if (cancelled) return;
        setSignal(s);
        setLoading(false);
        // keep polling while the peer-universe batch is still building
        if (s.composite.status === "building") {
          pollRef.current = setTimeout(load, 8000);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [symbol]);

  if (loading) {
    return (
      <Card title="Signal composite Taurus">
        <div className="p-2 text-sm text-[var(--text-muted)]">Calcul de la régression factorielle…</div>
      </Card>
    );
  }
  if (error || !signal) {
    return (
      <Card title="Signal composite Taurus">
        <div className="p-2 text-sm text-[var(--text-muted)]">
          Signal indisponible pour cet instrument (indice, ETF, ou historique insuffisant).
        </div>
      </Card>
    );
  }

  const a = signal.alpha;
  const c = signal.composite;
  const stance = c.stance ? STANCE[c.stance] : null;

  return (
    <Card
      title="Signal composite Taurus (α FF5/6 + MM + momentum)"
      action={
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: "var(--series-1)", color: "#fff" }}
        >
          ⬢ {a.model} · {signal.region}
        </span>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---- Composite z-score + stance ---- */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Score composite
          </div>
          {c.status === "ready" && c.composite != null ? (
            <>
              <div className="flex items-baseline gap-3">
                <span className="tabular text-3xl font-bold" style={{ color: stance?.color }}>
                  {formatNumber(c.composite, 2)}
                </span>
                {stance && (
                  <span className="rounded px-2 py-0.5 text-sm font-bold" style={{ background: "rgba(255,255,255,0.06)", color: stance.color }}>
                    {stance.label}
                  </span>
                )}
              </div>
              <div className="space-y-2.5">
                <ZBar label="Alpha FF5/6 (t-stat)" weight={c.weights?.alpha ?? 0.4} z={c.z_alpha} />
                <ZBar label="Divergence MM" weight={c.weights?.mm ?? 0.3} z={c.z_divergence} />
                <ZBar label="Momentum vol-ajusté" weight={c.weights?.momentum ?? 0.3} z={c.z_momentum} />
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                z-scores robustes (médiane/MAD) contre {c.n_peers} pairs de la région. Composite ={" "}
                {Math.round((c.weights?.alpha ?? 0.4) * 100)}%·α + {Math.round((c.weights?.mm ?? 0.3) * 100)}%·MM +{" "}
                {Math.round((c.weights?.momentum ?? 0.3) * 100)}%·mom. LONG ≥ +0,5 · SHORT ≤ −0,5.
              </div>
            </>
          ) : c.status === "building" ? (
            <div className="rounded border border-[var(--series-1)]/25 bg-[var(--series-1)]/[0.05] px-3 py-2 text-sm text-[var(--text-secondary)]">
              Calcul de l'univers de pairs en cours (régressions factorielles + valorisations MM)… la jambe
              alpha est déjà disponible ci-contre. Actualisation automatique.
            </div>
          ) : (
            <div className="text-sm text-[var(--text-muted)]">
              Univers de pairs indisponible pour cette région (données insuffisantes).
            </div>
          )}
        </div>

        {/* ---- FF5/6 alpha detail ---- */}
        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Alpha SML (régression {a.model}, {a.n_obs} mois)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-white/5 bg-[var(--surface-2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Alpha annualisé</div>
              <div className="tabular text-lg font-semibold" style={{ color: a.alpha_annual >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                {formatPct(a.alpha_annual * 100, 2)}
              </div>
            </div>
            <div className="rounded border border-white/5 bg-[var(--surface-2)] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">t-stat (HC1)</div>
              <div className="tabular text-lg font-semibold">
                {formatNumber(a.alpha_tstat, 2)}
                <span className="ml-2 text-xs font-normal" style={{ color: a.significant ? "var(--status-good)" : "var(--text-muted)" }}>
                  {a.significant ? "significatif" : `|t|<${formatNumber(a.t_crit, 2)}`}
                </span>
              </div>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-[var(--text-muted)]">
              <span>Expositions factorielles (betas)</span>
              <span>R² {formatNumber(a.r_squared, 2)}</span>
            </div>
            <div className="space-y-1">
              {Object.entries(a.betas).map(([factor, beta]) => (
                <div key={factor} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 text-[var(--text-secondary)]">{FACTOR_LABEL[factor] ?? factor}</span>
                  <div className="relative h-1.5 flex-1 rounded bg-[var(--surface-3)]">
                    <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                    <div
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${((Math.min(Math.max(beta, -2), 2) + 2) / 4) * 100}%`,
                        background: beta >= 0 ? "var(--series-1)" : "var(--series-6)",
                      }}
                    />
                  </div>
                  <span className="tabular w-10 text-right">{formatNumber(beta, 2)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            Régression Fama-French {a.model} (facteurs Ken French {a.region}), erreurs-types HC1, seuil Student-t
            ν=5. L'alpha est le rendement résiduel après neutralisation des facteurs — le cœur du signal Taurus.
          </div>
        </div>
      </div>
    </Card>
  );
}
