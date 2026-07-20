import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/client";
import type { SecurityChart, SecurityFundamentals, SecurityOverview, SecurityQuote } from "../api/types";
import { Card } from "../components/ui/Card";
import { LoadingState, ErrorState } from "../components/ui/States";
import { ValuationCard } from "../components/ValuationCard";
import { formatNumber, formatPct } from "../lib/format";

const QUOTE_POLL_MS = 15_000;

const RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1J" },
  { key: "5d", label: "5J" },
  { key: "1mo", label: "1M" },
  { key: "6mo", label: "6M" },
  { key: "ytd", label: "YTD" },
  { key: "1y", label: "1A" },
  { key: "5y", label: "5A" },
  { key: "max", label: "MAX" },
];

// ranges served with daily/weekly bars, where moving averages make sense
const MA_RANGES = new Set(["6mo", "ytd", "1y", "5y", "max"]);

const RECO_LABEL: Record<string, { label: string; color: string }> = {
  strong_buy: { label: "Achat fort", color: "var(--status-good)" },
  buy: { label: "Achat", color: "var(--status-good)" },
  hold: { label: "Conserver", color: "var(--status-warning)" },
  underperform: { label: "Sous-performance", color: "var(--status-serious)" },
  sell: { label: "Vente", color: "var(--status-critical)" },
};

const TOOLTIP_STYLE = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: 12,
} as const;

function compactNumber(v: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

function pct01(v: number | null): string | null {
  return v != null ? `${(v * 100).toFixed(2)}%` : null;
}

function num(v: number | null, decimals = 2): string | null {
  return v != null ? formatNumber(v, decimals) : null;
}

function compactCcy(v: number | null, ccy: string): string | null {
  return v != null ? `${compactNumber(v)} ${ccy}` : null;
}

function dateFromTs(ts: number | null): string | null {
  return ts != null
    ? new Date(ts * 1000).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
    : null;
}

function chartTimeFormatter(range: string) {
  return (t: number) => {
    const d = new Date(t * 1000);
    if (range === "1d") return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (range === "5d") return d.toLocaleDateString("fr-FR", { weekday: "short", hour: "2-digit" });
    if (range === "5y" || range === "max") return d.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  };
}

function Stat({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="rounded border border-white/5 bg-[var(--surface-2)] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="tabular mt-0.5 text-sm font-medium">{value}</div>
    </div>
  );
}

function StatSection({ title, items }: { title: string; items: [string, string | null][] }) {
  const visible = items.filter(([, v]) => v != null);
  if (visible.length === 0) return null;
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{title}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {visible.map(([label, value]) => (
          <Stat key={label} label={label} value={value} />
        ))}
      </div>
    </div>
  );
}

function RatiosCard({ f, currency }: { f: SecurityFundamentals; currency: string }) {
  const v = f.valuation;
  const p = f.profitability;
  const h = f.health;
  const d = f.dividend;
  const o = f.ownership;
  return (
    <Card title="Ratios & données financières">
      <div className="space-y-5">
        <StatSection
          title="Valorisation"
          items={[
            ["Capitalisation", compactCcy(v.market_cap, currency)],
            ["Valeur d'entreprise", compactCcy(v.enterprise_value, currency)],
            ["PER (trailing)", num(v.trailing_pe)],
            ["PER (forward)", num(v.forward_pe)],
            ["PEG", num(v.peg)],
            ["Cours / Actif net", num(v.price_to_book)],
            ["Cours / CA", num(v.price_to_sales)],
            ["VE / EBITDA", num(v.ev_to_ebitda)],
            ["VE / CA", num(v.ev_to_revenue)],
            ["Bêta", num(v.beta)],
          ]}
        />
        <StatSection
          title="Rentabilité & croissance"
          items={[
            ["Chiffre d'affaires (TTM)", compactCcy(p.revenue, currency)],
            ["Croissance CA", p.revenue_growth != null ? formatPct(p.revenue_growth * 100) : null],
            ["Croissance bénéfices", p.earnings_growth != null ? formatPct(p.earnings_growth * 100) : null],
            ["Marge brute", pct01(p.gross_margin)],
            ["Marge opérationnelle", pct01(p.operating_margin)],
            ["Marge nette", pct01(p.profit_margin)],
            ["EBITDA", compactCcy(p.ebitda, currency)],
            ["ROE", pct01(p.roe)],
            ["ROA", pct01(p.roa)],
            ["BPA (trailing)", num(p.eps)],
            ["BPA (forward)", num(p.forward_eps)],
          ]}
        />
        <StatSection
          title="Santé financière"
          items={[
            ["Trésorerie", compactCcy(h.total_cash, currency)],
            ["Dette totale", compactCcy(h.total_debt, currency)],
            ["Dette / Fonds propres", h.debt_to_equity != null ? `${formatNumber(h.debt_to_equity, 1)}%` : null],
            ["Current ratio", num(h.current_ratio)],
            ["Quick ratio", num(h.quick_ratio)],
            ["Free cash-flow", compactCcy(h.free_cashflow, currency)],
            ["Cash-flow opérationnel", compactCcy(h.operating_cashflow, currency)],
          ]}
        />
        <StatSection
          title="Dividende"
          items={[
            ["Rendement", pct01(d.yield)],
            ["Dividende / action", num(d.rate)],
            ["Taux de distribution", pct01(d.payout_ratio)],
            ["Ex-dividende", dateFromTs(d.ex_dividend_date)],
            ["Rendement moyen 5 ans", d.five_year_avg_yield != null ? `${formatNumber(d.five_year_avg_yield)}%` : null],
          ]}
        />
        <StatSection
          title="Actionnariat & flottant"
          items={[
            ["Actions en circulation", o.shares_outstanding != null ? compactNumber(o.shares_outstanding) : null],
            ["Flottant", o.float_shares != null ? compactNumber(o.float_shares) : null],
            ["Détention initiés", pct01(o.held_insiders)],
            ["Détention institutionnels", pct01(o.held_institutions)],
            ["Short ratio (jours)", num(o.short_ratio, 1)],
            ["Short % du flottant", pct01(o.short_percent_float)],
            ["Volume moyen", o.avg_volume != null ? compactNumber(o.avg_volume) : null],
          ]}
        />
      </div>
    </Card>
  );
}

function AnalystCard({ f, price }: { f: SecurityFundamentals; price: number }) {
  const a = f.analyst;
  const reco = a.recommendation ? RECO_LABEL[a.recommendation] : null;
  const trend = a.trend;
  const total = trend ? trend.strong_buy + trend.buy + trend.hold + trend.sell + trend.strong_sell : 0;
  const hasTargets = a.target_low != null && a.target_high != null && a.target_high > (a.target_low ?? 0);
  const clamp = (x: number) => Math.min(100, Math.max(0, x));
  const posPct = (x: number) =>
    hasTargets ? clamp(((x - (a.target_low as number)) / ((a.target_high as number) - (a.target_low as number))) * 100) : 0;
  const upside = a.target_mean != null && price > 0 ? ((a.target_mean / price) - 1) * 100 : null;

  if (!reco && !trend && !hasTargets) return null;

  return (
    <Card title={`Consensus analystes${a.num_analysts ? ` (${a.num_analysts})` : ""}`}>
      <div className="space-y-4">
        {reco && (
          <div className="flex items-center gap-3">
            <span className="rounded px-2 py-1 text-sm font-semibold" style={{ background: "rgba(255,255,255,0.06)", color: reco.color }}>
              {reco.label}
            </span>
            {a.recommendation_mean != null && (
              <span className="text-xs text-[var(--text-muted)]">note moyenne {formatNumber(a.recommendation_mean, 1)} / 5 (1 = achat fort)</span>
            )}
          </div>
        )}

        {trend && total > 0 && (
          <div>
            <div className="flex h-3 w-full overflow-hidden rounded">
              {(
                [
                  [trend.strong_buy, "var(--status-good)"],
                  [trend.buy, "#66b866"],
                  [trend.hold, "var(--status-warning)"],
                  [trend.sell, "var(--status-serious)"],
                  [trend.strong_sell, "var(--status-critical)"],
                ] as [number, string][]
              ).map(([n, color], i) =>
                n > 0 ? <div key={i} style={{ width: `${(n / total) * 100}%`, background: color }} /> : null
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
              <span>Achat fort {trend.strong_buy}</span>
              <span>Achat {trend.buy}</span>
              <span>Conserver {trend.hold}</span>
              <span>Vente {trend.sell}</span>
              <span>Vente forte {trend.strong_sell}</span>
            </div>
          </div>
        )}

        {hasTargets && (
          <div>
            <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
              <span>Objectif bas {formatNumber(a.target_low as number)}</span>
              <span>Objectif haut {formatNumber(a.target_high as number)}</span>
            </div>
            <div className="relative h-2 w-full rounded bg-[var(--surface-3)]">
              {a.target_mean != null && (
                <div
                  className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-[var(--series-1)]"
                  style={{ left: `${posPct(a.target_mean)}%` }}
                  title={`Objectif moyen ${formatNumber(a.target_mean)}`}
                />
              )}
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--surface-0)]"
                style={{ left: `${posPct(price)}%` }}
                title={`Cours actuel ${formatNumber(price)}`}
              />
            </div>
            <div className="mt-1.5 text-xs text-[var(--text-secondary)]">
              ● cours actuel · | objectif moyen {a.target_mean != null ? formatNumber(a.target_mean) : "—"}
              {upside != null && (
                <span style={{ color: upside >= 0 ? "var(--status-good)" : "var(--status-critical)" }}>
                  {" "}
                  ({formatPct(upside)} vs cours)
                </span>
              )}
            </div>
          </div>
        )}

        {f.calendar.next_earnings_date != null && (
          <div className="rounded border border-[var(--series-1)]/30 bg-[var(--series-1)]/10 px-3 py-2 text-sm">
            <span className="text-[var(--text-muted)]">Prochains résultats : </span>
            <span className="font-medium">{dateFromTs(f.calendar.next_earnings_date)}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function EarningsCard({ f, currency }: { f: SecurityFundamentals; currency: string }) {
  const qeps = f.earnings_history.quarterly_eps.filter((q) => q.actual != null || q.estimate != null);
  const yearly = f.earnings_history.yearly_financials.filter((y) => y.revenue != null);
  if (qeps.length === 0 && yearly.length === 0) return null;
  return (
    <Card title="Historique de résultats">
      <div className="grid gap-6 lg:grid-cols-2">
        {qeps.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              BPA trimestriel — réel vs estimé
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={qeps} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--gridline)" vertical={false} />
                <XAxis dataKey="quarter" stroke="var(--baseline)" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis stroke="var(--baseline)" tick={{ fill: "var(--text-muted)", fontSize: 11 }} width={45} />
                <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={{ color: "var(--text-secondary)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Estimé" dataKey="estimate" fill="var(--text-muted)" radius={[2, 2, 0, 0]} />
                <Bar name="Réel" dataKey="actual" fill="var(--series-1)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {yearly.length > 0 && (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              CA & bénéfice net annuels ({currency})
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={yearly} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--gridline)" vertical={false} />
                <XAxis dataKey="year" stroke="var(--baseline)" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                <YAxis
                  stroke="var(--baseline)"
                  tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                  width={50}
                  tickFormatter={(v) => compactNumber(Number(v))}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelStyle={{ color: "var(--text-secondary)" }}
                  formatter={(value: number | string) => compactNumber(Number(value))}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar name="Chiffre d'affaires" dataKey="revenue" fill="var(--series-5)" radius={[2, 2, 0, 0]} />
                <Bar name="Bénéfice net" dataKey="earnings" fill="var(--series-1)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}

function sma(points: { c: number }[], window: number, idx: number): number | null {
  if (idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i++) sum += points[i].c;
  return sum / window;
}

export function SecurityPage() {
  const { symbol = "" } = useParams();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<SecurityQuote | null>(null);
  const [range, setRange] = useState("1d");
  const [chart, setChart] = useState<SecurityChart | null>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [showMa50, setShowMa50] = useState(false);
  const [showMa200, setShowMa200] = useState(false);
  const [showVolume, setShowVolume] = useState(true);
  const [watchBusy, setWatchBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);
    setQuote(null);
    setRange("1d");
    api
      .securityOverview(symbol)
      .then((d) => {
        if (cancelled) return;
        setOverview(d);
        setQuote(d.quote);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  // Near-real-time price: refresh the header quote every 15 s
  useEffect(() => {
    const id = setInterval(() => {
      api
        .securityQuote(symbol)
        .then(setQuote)
        .catch(() => undefined);
    }, QUOTE_POLL_MS);
    return () => clearInterval(id);
  }, [symbol]);

  useEffect(() => {
    let cancelled = false;
    setChartLoading(true);
    api
      .securityChart(symbol, range)
      .then((d) => !cancelled && setChart(d))
      .catch(() => !cancelled && setChart(null))
      .finally(() => !cancelled && setChartLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol, range]);

  const chartData = useMemo(() => {
    if (!chart) return [];
    const maOk = MA_RANGES.has(range);
    return chart.points.map((p, i) => ({
      ...p,
      ma50: maOk && showMa50 ? sma(chart.points, 50, i) : null,
      ma200: maOk && showMa200 ? sma(chart.points, 200, i) : null,
    }));
  }, [chart, range, showMa50, showMa200]);

  async function toggleWatchlist() {
    if (!overview || !quote) return;
    setWatchBusy(true);
    try {
      if (overview.in_watchlist && overview.watchlist_item_id != null) {
        await api.removeWatchlistItem(overview.watchlist_item_id);
        setOverview({ ...overview, in_watchlist: false, watchlist_item_id: null });
      } else {
        const created = await api.addWatchlistItem({
          ticker: quote.symbol,
          data_symbol: quote.symbol,
          name: quote.name,
          currency: quote.currency,
          last_price: quote.price,
        } as never);
        setOverview({ ...overview, in_watchlist: true, watchlist_item_id: (created as { id: number }).id });
      }
    } finally {
      setWatchBusy(false);
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!overview || !quote) return <ErrorState message={`Titre introuvable: ${symbol}`} />;

  const up = quote.change_pct >= 0;
  const changeColor = up ? "var(--status-good)" : "var(--status-critical)";
  const f = overview.fundamentals;
  const profile = f?.profile;
  const chartUp = chart && chart.points.length > 1 ? chart.points[chart.points.length - 1].c >= chart.points[0].c : up;
  const chartColor = chartUp ? "var(--status-good)" : "var(--status-critical)";
  const maxVolume = chartData.reduce((m, p) => Math.max(m, p.v || 0), 0);

  return (
    <div className="space-y-4">
      {/* ---- Header: live quote ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{quote.symbol}</h1>
            <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-[var(--text-muted)]">{quote.exchange}</span>
            {profile?.sector && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-[var(--text-muted)]">{profile.sector}</span>
            )}
          </div>
          <div className="mt-0.5 text-sm text-[var(--text-secondary)]">{quote.name}</div>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="tabular text-4xl font-bold">{formatNumber(quote.price)}</span>
            <span className="text-sm text-[var(--text-muted)]">{quote.currency}</span>
            <span className="tabular text-lg font-semibold" style={{ color: changeColor }}>
              {up ? "▲" : "▼"} {formatPct(quote.change_pct, 2)}
            </span>
          </div>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            Rafraîchi toutes les 15 s · données Yahoo Finance (certaines places différées)
          </div>
        </div>
        <div className="flex items-center gap-2">
        <Link
          to={`/research/${encodeURIComponent(quote.symbol)}`}
          className="rounded border border-white/15 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
        >
          Recherche Equity →
        </Link>
        <button
          onClick={toggleWatchlist}
          disabled={watchBusy}
          className={`rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
            overview.in_watchlist
              ? "border border-white/15 text-[var(--text-secondary)] hover:bg-white/5"
              : "bg-[var(--series-1)] text-white hover:opacity-90"
          }`}
        >
          {overview.in_watchlist ? "★ Retirer de la watchlist" : "☆ Ajouter à la watchlist"}
        </button>
        </div>
      </div>

      {/* ---- Day stats strip ---- */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Clôture veille" value={quote.previous_close != null ? formatNumber(quote.previous_close) : null} />
        <Stat
          label="Plage du jour"
          value={
            quote.day_low != null && quote.day_high != null
              ? `${formatNumber(quote.day_low)} – ${formatNumber(quote.day_high)}`
              : null
          }
        />
        <Stat
          label="Plage 52 sem."
          value={
            quote.fifty_two_week_low != null && quote.fifty_two_week_high != null
              ? `${formatNumber(quote.fifty_two_week_low)} – ${formatNumber(quote.fifty_two_week_high)}`
              : null
          }
        />
        <Stat label="Volume" value={quote.volume != null ? compactNumber(quote.volume) : null} />
        <Stat label="Type" value={quote.instrument_type} />
        <Stat label="Devise" value={quote.currency} />
      </div>

      {/* ---- Price chart with volume + moving averages ---- */}
      <Card
        title="Cours"
        action={
          <div className="flex flex-wrap items-center gap-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`rounded px-2 py-1 text-xs ${
                  range === r.key
                    ? "bg-[var(--series-1)]/20 text-[var(--series-1)]"
                    : "text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {r.label}
              </button>
            ))}
            <span className="mx-1 h-4 w-px bg-white/10" />
            <button
              onClick={() => setShowVolume((v) => !v)}
              className={`rounded px-2 py-1 text-xs ${
                showVolume ? "bg-white/10 text-[var(--text-secondary)]" : "text-[var(--text-muted)] hover:bg-white/5"
              }`}
            >
              Vol
            </button>
            {MA_RANGES.has(range) && (
              <>
                <button
                  onClick={() => setShowMa50((v) => !v)}
                  className={`rounded px-2 py-1 text-xs ${
                    showMa50 ? "bg-[var(--series-4)]/25 text-[var(--series-4)]" : "text-[var(--text-muted)] hover:bg-white/5"
                  }`}
                >
                  MM50
                </button>
                <button
                  onClick={() => setShowMa200((v) => !v)}
                  className={`rounded px-2 py-1 text-xs ${
                    showMa200 ? "bg-[var(--series-7)]/25 text-[var(--series-7)]" : "text-[var(--text-muted)] hover:bg-white/5"
                  }`}
                >
                  MM200
                </button>
              </>
            )}
          </div>
        }
      >
        {chartLoading && <LoadingState />}
        {!chartLoading && (!chart || chart.points.length === 0) && (
          <div className="p-4 text-sm text-[var(--text-muted)]">Pas de données pour cette période.</div>
        )}
        {!chartLoading && chart && chart.points.length > 0 && (
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="secFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={chartTimeFormatter(range)}
                stroke="var(--baseline)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                minTickGap={60}
              />
              <YAxis
                yAxisId="price"
                domain={["auto", "auto"]}
                tickFormatter={(v) => formatNumber(Number(v))}
                stroke="var(--baseline)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                width={70}
              />
              {/* volume rides in the bottom quarter of the chart, no axis labels */}
              <YAxis yAxisId="vol" hide domain={[0, maxVolume * 4 || 1]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "var(--text-secondary)" }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString("fr-FR")}
                formatter={(value: number | string, name: string) => {
                  if (name === "Volume") return [compactNumber(Number(value)), name];
                  return [`${formatNumber(Number(value))} ${chart.currency}`, name];
                }}
              />
              {showVolume && (
                <Bar yAxisId="vol" name="Volume" dataKey="v" fill="var(--text-muted)" opacity={0.35} isAnimationActive={false} />
              )}
              <Area
                yAxisId="price"
                name="Cours"
                type="monotone"
                dataKey="c"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#secFill)"
              />
              {showMa50 && MA_RANGES.has(range) && (
                <Line yAxisId="price" name="MM50" type="monotone" dataKey="ma50" stroke="var(--series-4)" strokeWidth={1.5} dot={false} connectNulls={false} />
              )}
              {showMa200 && MA_RANGES.has(range) && (
                <Line yAxisId="price" name="MM200" type="monotone" dataKey="ma200" stroke="var(--series-7)" strokeWidth={1.5} dot={false} connectNulls={false} />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ---- Valuation verdict ---- */}
      {overview.valuation && <ValuationCard valuation={overview.valuation} currency={quote.currency} />}

      {/* ---- Ratios ---- */}
      {f && <RatiosCard f={f} currency={quote.currency} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {f && <AnalystCard f={f} price={quote.price} />}

        {/* ---- Internal holdings cross-reference ---- */}
        <Card title="Dans vos portefeuilles">
          {overview.holdings.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">Aucun client ne détient ce titre.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                  <th className="pb-2">Client</th>
                  <th className="pb-2">Portefeuille</th>
                  <th className="pb-2 text-right">Quantité</th>
                  <th className="pb-2 text-right">PRU</th>
                </tr>
              </thead>
              <tbody>
                {overview.holdings.map((h, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="py-2">
                      {h.client_id != null ? (
                        <Link to={`/clients/${h.client_id}`} className="text-[var(--series-1)] hover:underline">
                          {h.client_name}
                        </Link>
                      ) : (
                        h.client_name
                      )}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{h.ptf_id}</td>
                    <td className="tabular py-2 text-right">{formatNumber(h.quantity, 0)}</td>
                    <td className="tabular py-2 text-right">
                      {formatNumber(h.avg_cost)} {h.currency}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-white/10 font-medium">
                  <td className="py-2" colSpan={2}>
                    Total
                  </td>
                  <td className="tabular py-2 text-right">{formatNumber(overview.total_quantity, 0)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {/* ---- Earnings history ---- */}
      {f && <EarningsCard f={f} currency={quote.currency} />}

      {/* ---- Company profile ---- */}
      {profile && (profile.description || profile.industry || profile.website) && (
        <Card title="Profil de la société">
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 text-sm lg:col-span-2">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-secondary)]">
                {profile.industry && (
                  <span>
                    <span className="text-[var(--text-muted)]">Industrie:</span> {profile.industry}
                  </span>
                )}
                {(profile.city || profile.country) && (
                  <span>
                    <span className="text-[var(--text-muted)]">Siège:</span>{" "}
                    {[profile.city, profile.country].filter(Boolean).join(", ")}
                  </span>
                )}
                {profile.employees != null && (
                  <span>
                    <span className="text-[var(--text-muted)]">Employés:</span>{" "}
                    {new Intl.NumberFormat("fr-FR").format(profile.employees)}
                  </span>
                )}
                {profile.website && (
                  <a href={profile.website} target="_blank" rel="noreferrer" className="text-[var(--series-1)] hover:underline">
                    Site web ↗
                  </a>
                )}
              </div>
              {profile.description && (
                <p className="max-h-56 overflow-y-auto pr-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {profile.description}
                </p>
              )}
            </div>
            {profile.officers.length > 0 && (
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Dirigeants
                </div>
                <div className="space-y-1.5 text-xs">
                  {profile.officers.map((o, i) => (
                    <div key={i}>
                      <div className="font-medium text-[var(--text-primary)]">{o.name}</div>
                      <div className="text-[var(--text-muted)]">{o.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ---- News ---- */}
      <Card title="Actualités">
        {overview.news.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">Aucune actualité récente.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {overview.news.map((n, i) => (
              <a
                key={i}
                href={n.link}
                target="_blank"
                rel="noreferrer"
                className="block py-2.5 first:pt-0 last:pb-0 hover:bg-white/[0.03]"
              >
                <div className="text-sm font-medium text-[var(--text-primary)]">{n.title}</div>
                <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                  {n.publisher}
                  {n.published_at != null &&
                    ` · ${new Date(n.published_at * 1000).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`}
                </div>
              </a>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
