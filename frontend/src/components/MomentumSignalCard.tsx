import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { MomentumSignal } from "../api/types";
import { Card } from "./ui/Card";
import { LoadingState } from "./ui/States";

const VERDICT_COLOR: Record<string, string> = {
  fort: "var(--status-good)",
  positif: "var(--status-good)",
  neutre: "var(--text-secondary)",
  négatif: "var(--status-critical)",
  faible: "var(--status-critical)",
};
const CRASH_COLOR: Record<string, string> = {
  faible: "var(--status-good)",
  modéré: "var(--status-warning)",
  élevé: "var(--status-critical)",
  inconnu: "var(--text-muted)",
};
const LEG_LABEL: Record<string, string> = {
  jt_long: "Jegadeesh-Titman 12-1 (long terme)",
  jt_short: "Jegadeesh-Titman 6-1 (court terme)",
  residual: "Momentum résiduel (ajusté facteurs)",
  risk_adj: "Momentum risk-adjusted (Sharpe)",
  vol_scaled: "Momentum vol-scaled",
  ff_alpha: "Alpha FF5/6",
  reversal: "Reversal 1 mois",
};

function fmtPct(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}
function fmtNum(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : v.toFixed(2);
}

export function MomentumSignalCard({ symbol }: { symbol: string }) {
  const [sig, setSig] = useState<MomentumSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    api.momentumSignal(symbol)
      .then((s) => !cancelled && setSig(s))
      .catch(() => !cancelled && setErr("Momentum indisponible (indice/ETF ou historique insuffisant)."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [symbol]);

  if (loading) return <Card title="Momentum composite"><LoadingState /></Card>;
  if (err || !sig) return <Card title="Momentum composite"><div className="text-sm text-[var(--text-muted)]">{err}</div></Card>;

  const c = sig.components;
  const scorePct = Math.max(0, Math.min(100, (sig.score + 100) / 2)); // -100..100 → 0..100 for the gauge

  return (
    <Card title="Momentum composite">
      {/* Score + verdict */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-3xl font-semibold tabular" style={{ color: VERDICT_COLOR[sig.verdict] }}>
            {sig.score >= 0 ? "+" : ""}{sig.score.toFixed(0)}
          </div>
          <div className="text-xs uppercase tracking-wide" style={{ color: VERDICT_COLOR[sig.verdict] }}>
            {sig.verdict}
          </div>
        </div>
        <div className="text-right text-xs">
          <div className="text-[var(--text-muted)]">Risque de crash momentum</div>
          <div className="font-medium" style={{ color: CRASH_COLOR[sig.crash_risk] }}>{sig.crash_risk}</div>
          <div className="mt-1 text-[var(--text-muted)]">
            Vol réalisée {fmtPct(c.realized_vol)} · cible {(c.target_vol * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      {/* Gauge -100..+100 */}
      <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full" style={{ width: `${scorePct}%`, background: VERDICT_COLOR[sig.verdict] }} />
      </div>

      {/* Component breakdown */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
        <Row k="JT 12-1 (long)" v={fmtPct(c.jt_long_12_1)} />
        <Row k="JT 6-1 (court)" v={fmtPct(c.jt_short_6_1)} />
        <Row k="Momentum résiduel" v={fmtNum(c.residual_momentum)} />
        <Row k="Sharpe momentum" v={fmtNum(c.sharpe_momentum)} />
        <Row k="Vol-scaled" v={fmtPct(c.vol_scaled_momentum)} />
        <Row k="Facteur d'échelle vol" v={fmtNum(c.vol_scale_factor)} />
        <Row k="Reversal 1M" v={fmtPct(c.reversal_1m)} />
        <Row k={`Alpha ${sig.ff.model ?? "FF"}`} v={c.residual_momentum === null ? "—" : `${sig.ff.alpha_annual != null ? (sig.ff.alpha_annual * 100).toFixed(1) + "%" : "—"} (t=${fmtNum(sig.ff.alpha_tstat)})`} />
      </div>

      {/* Legs contributing to the blend */}
      <div className="mt-3 border-t border-white/5 pt-2">
        <div className="mb-1 text-[10px] uppercase text-[var(--text-muted)]">Contribution des jambes</div>
        <div className="space-y-1">
          {sig.legs.map((l) => (
            <div key={l.key} className="flex items-center gap-2 text-xs">
              <span className="w-52 shrink-0 text-[var(--text-secondary)]">{LEG_LABEL[l.key] ?? l.key}</span>
              <div className="relative h-1.5 flex-1 rounded-full bg-white/5">
                <div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: l.score >= 0 ? "50%" : `${50 + l.score * 50}%`,
                    width: `${Math.abs(l.score) * 50}%`,
                    background: l.score >= 0 ? "var(--status-good)" : "var(--status-critical)",
                  }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
              </div>
              <span className="w-10 shrink-0 text-right tabular text-[var(--text-muted)]">{l.score >= 0 ? "+" : ""}{l.score.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 text-[10px] text-[var(--text-muted)]">
        FF5/6 + Jegadeesh-Titman (long/court) + momentum résiduel + risk-adjusted + vol-scaled/crash-protected
        (Barroso-Santa-Clara). Aide à la décision — pas un conseil.
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-0.5">
      <span className="text-[var(--text-muted)]">{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}
