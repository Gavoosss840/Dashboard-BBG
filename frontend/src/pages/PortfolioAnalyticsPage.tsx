import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api } from "../api/client";
import type { AnalyticsAsset, PortfolioAnalytics } from "../api/types";
import { Card } from "../components/ui/Card";
import { ErrorState, LoadingState } from "../components/ui/States";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";

const PERIODS = [
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
];
const BENCHMARKS = [
  { sym: "^GSPC", label: "S&P 500" },
  { sym: "^STOXX50E", label: "Euro Stoxx 50" },
  { sym: "^FCHI", label: "CAC 40" },
  { sym: "^NDX", label: "Nasdaq 100" },
  { sym: "ACWI", label: "MSCI ACWI" },
];

const pct = (v: number | null | undefined, d = 1) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined ? "—" : v.toFixed(d);

function corrColor(v: number): string {
  // -1 (green, diversifying) → 0 (neutral) → +1 (red, concentrated)
  if (v >= 0) {
    const a = 0.12 + v * 0.5;
    return `rgba(208, 59, 59, ${a.toFixed(2)})`;
  }
  const a = 0.12 + Math.abs(v) * 0.5;
  return `rgba(12, 163, 12, ${a.toFixed(2)})`;
}

export function PortfolioAnalyticsPage() {
  const { id } = useParams();
  const portfolioId = Number(id);
  const navigate = useNavigate();
  const { currency } = useCurrency();
  const [period, setPeriod] = useState("1y");
  const [benchmark, setBenchmark] = useState("^GSPC");

  const { data, loading, error } = useApi(
    () => api.portfolioAnalytics(portfolioId, currency, period, benchmark),
    [portfolioId, currency, period, benchmark]
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            ← Retour
          </button>
          <h1 className="mt-1 text-2xl font-bold">Analyse quantitative du portefeuille</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {data?.ok ? data.label : `Portefeuille #${portfolioId}`} · devise {currency} ·
            calculée sur l'historique de prix réel des lignes
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-xs ${
                  period === p.key
                    ? "bg-[var(--series-1)] text-black"
                    : "text-[var(--text-secondary)] hover:bg-white/5"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          <select
            value={benchmark}
            onChange={(e) => setBenchmark(e.target.value)}
            className="rounded-md border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
            title="Benchmark de marché (pour bêta, CML, SML)"
          >
            {BENCHMARKS.map((b) => (
              <option key={b.sym} value={b.sym}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}
      {!loading && data && !data.ok && (
        <Card title="Analyse indisponible">
          <div className="text-sm text-[var(--status-warning)]">{data.error}</div>
          {data.skipped && data.skipped.length > 0 && (
            <div className="mt-2 text-xs text-[var(--text-muted)]">
              Lignes écartées : {data.skipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}
            </div>
          )}
        </Card>
      )}

      {!loading && data && data.ok && data.portfolio && (
        <>
          <MetricTiles data={data} />
          <div className="grid gap-4 xl:grid-cols-2">
            <FrontierChart data={data} />
            <SmlChart data={data} />
          </div>
          <AssetTable assets={data.assets ?? []} currency={currency} />
          <CorrelationMatrix corr={data.correlation} />
          {data.skipped && data.skipped.length > 0 && (
            <div className="text-xs text-[var(--text-muted)]">
              Lignes écartées du calcul (dérivés ou sans historique actions exploitable) :{" "}
              {data.skipped.map((s) => `${s.ticker} (${s.reason})`).join(", ")}.
            </div>
          )}
          <p className="text-[11px] text-[var(--text-muted)]">
            Rendements et volatilités annualisés (252 j) à partir des cours quotidiens réels ·
            {data.observations} observations jusqu'au {data.as_of} · taux sans risque{" "}
            {pct(data.risk_free, 1)} · benchmark {data.benchmark}. Frontière de Markowitz non
            contrainte (vente à découvert autorisée, cohérente avec un mandat long/short). Aide à la
            décision — pas un conseil en investissement.
          </p>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
function Tile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "var(--status-good)"
      : tone === "bad"
      ? "var(--status-critical)"
      : "var(--text-primary)";
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--surface-1)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="text-lg font-semibold tabular" style={{ color }}>
        {value}
      </div>
      {sub && <div className="text-[10px] text-[var(--text-muted)]">{sub}</div>}
    </div>
  );
}

function MetricTiles({ data }: { data: PortfolioAnalytics }) {
  const p = data.portfolio!;
  const b = data.benchmark_stats!;
  const toneRet = (v: number) => (v >= 0 ? "good" : "bad");
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Rendement attendu (ann.)" value={pct(p.expected_return)} tone={toneRet(p.expected_return)} sub="arithmétique, base frontière" />
      <Tile label="Rendement réalisé (ann.)" value={pct(p.annualised_return)} tone={toneRet(p.annualised_return)} sub="géométrique" />
      <Tile label="Volatilité (ann.)" value={pct(p.annualised_vol)} sub={`marché ${pct(b.annualised_vol)}`} />
      <Tile label="Sharpe" value={num(p.sharpe)} tone={(p.sharpe ?? 0) >= 1 ? "good" : (p.sharpe ?? 0) < 0 ? "bad" : "neutral"} sub={`marché ${num(b.sharpe)}`} />
      <Tile label="Sortino" value={num(p.sortino)} />
      <Tile label="Bêta (vs marché)" value={num(p.beta)} sub={`Treynor ${pct(p.treynor)}`} />
      <Tile label="Alpha de Jensen (ann.)" value={pct(p.alpha)} tone={(p.alpha ?? 0) >= 0 ? "good" : "bad"} />
      <Tile label="Max drawdown" value={pct(p.max_drawdown)} tone="bad" />
      <Tile label="VaR 95% (1j)" value={pct(-p.var_95)} tone="bad" sub={`CVaR ${pct(-p.cvar_95)}`} />
      <Tile label="VaR 99% (1j)" value={pct(-p.var_99)} tone="bad" sub={`CVaR ${pct(-p.cvar_99)}`} />
      <Tile label="Tracking error" value={pct(p.tracking_error)} sub={`Info ratio ${num(p.information_ratio)}`} />
      <Tile label="Capture haussière / baissière" value={`${num(p.up_capture)} / ${num(p.down_capture)}`} />
      <Tile label="Ratio de diversification" value={num(p.diversification_ratio)} sub={`≈ ${num(p.effective_bets, 1)} paris effectifs`} />
      <Tile label="Skewness" value={num(data.portfolio!.skew)} sub={`kurtosis exc. ${num(p.excess_kurtosis)}`} />
      <Tile label="Exposition nette" value={pct(p.net_exposure / (p.gross_exposure || 1))} sub="en % du brut" />
      <Tile label="Sharpe tangence" value={num(data.frontier?.tangency?.sharpe ?? null)} sub="portefeuille optimal" />
    </div>
  );
}

// -------------------------------------------------------------------------
function FrontierChart({ data }: { data: PortfolioAnalytics }) {
  const frontier = data.frontier;
  const assetPts = (data.assets ?? []).map((a) => ({
    x: a.ann_vol * 100,
    y: a.ann_return * 100,
    name: a.symbol,
  }));
  const frontierPts = (frontier?.points ?? []).map((p) => ({ x: p.vol * 100, y: p.ret * 100 }));
  const cmlPts = (data.cml?.points ?? []).map((p) => ({ x: p.vol * 100, y: p.ret * 100 }));
  const gmv = frontier?.gmv ? [{ x: frontier.gmv.vol * 100, y: frontier.gmv.ret * 100 }] : [];
  const tan = frontier?.tangency ? [{ x: frontier.tangency.vol * 100, y: frontier.tangency.ret * 100 }] : [];
  const current = data.current_point ? [{ x: data.current_point.vol * 100, y: data.current_point.ret * 100 }] : [];

  return (
    <Card title="Frontière efficiente · Capital Market Line">
      {!frontier ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">
          Frontière non calculable (matrice de covariance singulière).
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="x"
                name="Volatilité"
                unit="%"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                label={{ value: "Volatilité annualisée (%)", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--text-muted)" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Rendement"
                unit="%"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                label={{ value: "Rendement (%)", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-muted)" }}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(v) => `${Number(v).toFixed(1)}%`}
              />
              {cmlPts.length > 0 && (
                <Scatter name="CML" data={cmlPts} line={{ stroke: "var(--status-warning)", strokeWidth: 1.5, strokeDasharray: "4 3" }} shape={() => <g />} />
              )}
              <Scatter name="Frontière" data={frontierPts} line={{ stroke: "var(--series-1)", strokeWidth: 2 }} shape={() => <g />} />
              <Scatter name="Titres" data={assetPts} fill="var(--text-secondary)" />
              {gmv.length > 0 && <Scatter name="Variance min." data={gmv} fill="var(--series-2)" shape="diamond" />}
              {tan.length > 0 && <Scatter name="Tangence" data={tan} fill="var(--status-warning)" shape="star" />}
              {current.length > 0 && <Scatter name="Portefeuille actuel" data={current} fill="var(--status-good)" shape="cross" />}
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]">
            <Legend swatch="var(--series-1)">frontière</Legend>
            <Legend swatch="var(--status-warning)">CML / tangence ★</Legend>
            <Legend swatch="var(--series-2)">variance min. ◆</Legend>
            <Legend swatch="var(--status-good)">portefeuille actuel ✚</Legend>
            <Legend swatch="var(--text-secondary)">titres</Legend>
          </div>
          {current.length > 0 && frontier.gmv && (
            <p className="mt-2 text-[11px] text-[var(--text-muted)]">
              Le portefeuille actuel {isEfficient(data) ? "se situe pratiquement sur" : "est en-deçà de"} la
              frontière efficiente. Volatilité min. atteignable {pct(frontier.gmv.ret)} pour {pct(frontier.gmv.vol)} de vol.
              {frontier.tangency && ` Portefeuille tangent : Sharpe ${num(frontier.tangency.sharpe)}.`}
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function isEfficient(data: PortfolioAnalytics): boolean {
  const cp = data.current_point;
  const pts = data.frontier?.points ?? [];
  if (!cp || pts.length === 0) return false;
  // Best (max) return on the frontier at ~current vol.
  const near = pts.reduce((best, p) =>
    Math.abs(p.vol - cp.vol) < Math.abs(best.vol - cp.vol) ? p : best
  );
  return cp.ret >= near.ret - 0.01; // within 1 pt of the frontier return
}

function Legend({ swatch, children }: { swatch: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: swatch }} />
      {children}
    </span>
  );
}

// -------------------------------------------------------------------------
function SmlChart({ data }: { data: PortfolioAnalytics }) {
  const sml = data.sml;
  const assetPts = (data.assets ?? [])
    .filter((a) => a.beta !== null)
    .map((a) => ({
      x: a.beta as number,
      y: a.ann_return * 100,
      name: a.symbol,
      mispricing: a.mispricing ?? 0,
    }));
  const smlPts = (sml?.points ?? []).map((p) => ({ x: p.beta, y: p.ret * 100 }));

  return (
    <Card title="Security Market Line · titres vs CAPM">
      {!sml ? (
        <div className="py-8 text-center text-sm text-[var(--text-muted)]">SML indisponible.</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="x"
                name="Bêta"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                label={{ value: "Bêta", position: "insideBottom", offset: -12, fontSize: 11, fill: "var(--text-muted)" }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Rendement"
                unit="%"
                tick={{ fontSize: 11, fill: "var(--text-muted)" }}
                label={{ value: "Rendement (%)", angle: -90, position: "insideLeft", fontSize: 11, fill: "var(--text-muted)" }}
              />
              <ZAxis range={[70, 70]} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                contentStyle={{ background: "var(--surface-2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                formatter={(v, n) => (n === "Bêta" ? Number(v).toFixed(2) : `${Number(v).toFixed(1)}%`)}
              />
              <Scatter name="SML" data={smlPts} line={{ stroke: "var(--series-1)", strokeWidth: 2 }} shape={() => <g />} />
              <Scatter name="Titres" data={assetPts}>
                {assetPts.map((pt, i) => (
                  <Cell key={i} fill={pt.mispricing >= 0 ? "var(--status-good)" : "var(--status-critical)"} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            Titres <span style={{ color: "var(--status-good)" }}>au-dessus</span> de la SML : rendement
            réalisé &gt; attendu par le CAPM (α&nbsp;&gt;&nbsp;0). En-dessous (
            <span style={{ color: "var(--status-critical)" }}>rouge</span>) : sous-performance ajustée
            du risque. Prime de marché réalisée {pct(sml.market_return - sml.risk_free)} sur la période.
          </p>
        </>
      )}
    </Card>
  );
}

// -------------------------------------------------------------------------
function AssetTable({ assets, currency }: { assets: AnalyticsAsset[]; currency: string }) {
  if (assets.length === 0) return null;
  return (
    <Card title="Décomposition par titre">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
              <th className="py-1.5 pr-3">Titre</th>
              <th className="px-2 text-right">Poids</th>
              <th className="px-2 text-right">Rdt ann.</th>
              <th className="px-2 text-right">Vol ann.</th>
              <th className="px-2 text-right">Bêta</th>
              <th className="px-2 text-right">Alpha</th>
              <th className="px-2 text-right">Sharpe</th>
              <th className="px-2 text-right">E[R] CAPM</th>
              <th className="px-2 text-right">Contrib. risque</th>
              <th className="px-2 text-right">Corr. ptf</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.symbol} className="border-t border-white/5">
                <td className="py-1.5 pr-3">
                  <Link to={`/security/${encodeURIComponent(a.symbol)}`} className="hover:text-[var(--series-1)] hover:underline">
                    {a.symbol}
                  </Link>
                  <span className="ml-2 text-[10px] text-[var(--text-muted)]">{a.sector}</span>
                </td>
                <td className="px-2 text-right tabular" style={{ color: a.weight < 0 ? "var(--status-critical)" : undefined }}>
                  {pct(a.weight)}
                </td>
                <td className="px-2 text-right tabular" style={{ color: a.ann_return >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {pct(a.ann_return)}
                </td>
                <td className="px-2 text-right tabular">{pct(a.ann_vol)}</td>
                <td className="px-2 text-right tabular">{num(a.beta)}</td>
                <td className="px-2 text-right tabular" style={{ color: (a.alpha ?? 0) >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {pct(a.alpha)}
                </td>
                <td className="px-2 text-right tabular">{num(a.sharpe)}</td>
                <td className="px-2 text-right tabular">{pct(a.capm_expected)}</td>
                <td className="px-2 text-right tabular">{pct(a.risk_contribution)}</td>
                <td className="px-2 text-right tabular">{num(a.corr_to_portfolio)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        Poids signés (négatif = position vendeuse) en % de l'exposition nette · valeurs en {currency}.
        Contribution au risque = part de la variance du portefeuille imputable à la ligne.
      </p>
    </Card>
  );
}

// -------------------------------------------------------------------------
function CorrelationMatrix({ corr }: { corr?: { symbols: string[]; matrix: number[][] } }) {
  const cells = useMemo(() => corr?.matrix ?? [], [corr]);
  if (!corr || corr.symbols.length < 2) return null;
  return (
    <Card title="Matrice de corrélation">
      <div className="overflow-x-auto">
        <table className="border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="p-1"></th>
              {corr.symbols.map((s) => (
                <th key={s} className="p-1 text-[var(--text-muted)]">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corr.symbols.map((s, i) => (
              <tr key={s}>
                <td className="p-1 pr-2 text-right text-[var(--text-muted)]">{s}</td>
                {cells[i].map((v, j) => (
                  <td
                    key={j}
                    className="p-1 text-center tabular"
                    style={{ background: corrColor(v), minWidth: 44, color: "var(--text-primary)" }}
                    title={`${corr.symbols[i]} / ${corr.symbols[j]} = ${v.toFixed(2)}`}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-muted)]">
        <span style={{ color: "var(--status-good)" }}>Vert</span> = corrélation faible/négative
        (diversifiant) · <span style={{ color: "var(--status-critical)" }}>rouge</span> = corrélation
        élevée (concentration du risque).
      </p>
    </Card>
  );
}
