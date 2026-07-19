import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api/client";
import type { SecurityChart, SecurityFundamentals, SecurityOverview, SecurityQuote } from "../api/types";
import { Card } from "../components/ui/Card";
import { LoadingState, ErrorState } from "../components/ui/States";
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

const RECO_LABEL: Record<string, { label: string; color: string }> = {
  strong_buy: { label: "Achat fort", color: "var(--status-good)" },
  buy: { label: "Achat", color: "var(--status-good)" },
  hold: { label: "Conserver", color: "var(--status-warning)" },
  underperform: { label: "Sous-performance", color: "var(--status-serious)" },
  sell: { label: "Vente", color: "var(--status-critical)" },
};

function compactNumber(v: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
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

function FundamentalsGrid({ f, currency }: { f: SecurityFundamentals; currency: string }) {
  const reco = f.recommendation ? RECO_LABEL[f.recommendation] : null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="Capitalisation" value={f.market_cap != null ? `${compactNumber(f.market_cap)} ${currency}` : null} />
      <Stat label="PER (trailing)" value={f.trailing_pe != null ? formatNumber(f.trailing_pe) : null} />
      <Stat label="PER (forward)" value={f.forward_pe != null ? formatNumber(f.forward_pe) : null} />
      <Stat label="BPA" value={f.eps != null ? formatNumber(f.eps) : null} />
      <Stat
        label="Rendement dividende"
        value={f.dividend_yield != null ? `${(f.dividend_yield * 100).toFixed(2)}%` : null}
      />
      <Stat label="Bêta" value={f.beta != null ? formatNumber(f.beta) : null} />
      <Stat label="Volume moyen" value={f.avg_volume != null ? compactNumber(f.avg_volume) : null} />
      <Stat
        label="Marge nette"
        value={f.profit_margin != null ? `${(f.profit_margin * 100).toFixed(1)}%` : null}
      />
      <Stat label="Chiffre d'affaires" value={f.revenue != null ? `${compactNumber(f.revenue)} ${currency}` : null} />
      <Stat
        label="Croissance CA"
        value={f.revenue_growth != null ? formatPct(f.revenue_growth * 100) : null}
      />
      <Stat
        label="Objectif analystes"
        value={
          f.target_mean_price != null
            ? `${formatNumber(f.target_mean_price)}${f.num_analysts ? ` (${f.num_analysts} analystes)` : ""}`
            : null
        }
      />
      {reco && (
        <div className="rounded border border-white/5 bg-[var(--surface-2)] px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">Consensus</div>
          <div className="mt-0.5 text-sm font-medium" style={{ color: reco.color }}>
            {reco.label}
          </div>
        </div>
      )}
    </div>
  );
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
  const [watchBusy, setWatchBusy] = useState(false);

  // Full overview on symbol change
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

  // Chart series per selected range
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
  const chartUp =
    chart && chart.points.length > 1 ? chart.points[chart.points.length - 1].c >= chart.points[0].c : up;
  const chartColor = chartUp ? "var(--status-good)" : "var(--status-critical)";

  return (
    <div className="space-y-4">
      {/* ---- Header: live quote ---- */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{quote.symbol}</h1>
            <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-[var(--text-muted)]">
              {quote.exchange}
            </span>
            {f?.sector && (
              <span className="rounded bg-white/5 px-2 py-0.5 text-xs text-[var(--text-muted)]">{f.sector}</span>
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

      {/* ---- Price chart ---- */}
      <Card
        title="Cours"
        action={
          <div className="flex gap-1">
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
          </div>
        }
      >
        {chartLoading && <LoadingState />}
        {!chartLoading && (!chart || chart.points.length === 0) && (
          <div className="p-4 text-sm text-[var(--text-muted)]">Pas de données pour cette période.</div>
        )}
        {!chartLoading && chart && chart.points.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chart.points} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
                domain={["auto", "auto"]}
                tickFormatter={(v) => formatNumber(Number(v))}
                stroke="var(--baseline)"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--text-secondary)" }}
                labelFormatter={(t) => new Date(Number(t) * 1000).toLocaleString("fr-FR")}
                formatter={(value) => [`${formatNumber(Number(value))} ${chart.currency}`, "Cours"]}
              />
              <Area type="monotone" dataKey="c" stroke={chartColor} strokeWidth={2} fill="url(#secFill)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* ---- Fundamentals ---- */}
      {f && (
        <Card title="Fondamentaux & consensus analystes">
          <FundamentalsGrid f={f} currency={quote.currency} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- Company profile ---- */}
        {f && (f.description || f.industry || f.website) && (
          <Card title="Profil de la société">
            <div className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--text-secondary)]">
                {f.industry && (
                  <span>
                    <span className="text-[var(--text-muted)]">Industrie:</span> {f.industry}
                  </span>
                )}
                {f.country && (
                  <span>
                    <span className="text-[var(--text-muted)]">Pays:</span> {f.country}
                  </span>
                )}
                {f.employees != null && (
                  <span>
                    <span className="text-[var(--text-muted)]">Employés:</span>{" "}
                    {new Intl.NumberFormat("fr-FR").format(f.employees)}
                  </span>
                )}
                {f.website && (
                  <a
                    href={f.website}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--series-1)] hover:underline"
                  >
                    Site web ↗
                  </a>
                )}
              </div>
              {f.description && (
                <p className="max-h-56 overflow-y-auto pr-2 text-[13px] leading-relaxed text-[var(--text-secondary)]">
                  {f.description}
                </p>
              )}
            </div>
          </Card>
        )}

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
