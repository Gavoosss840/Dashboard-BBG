import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import type {
  RiskCheckResult,
  RiskSettings,
  SecurityOverview,
  SecuritySearchQuote,
} from "../api/types";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { ValuationCard } from "../components/ValuationCard";
import { TaurusSignalCard } from "../components/TaurusSignalCard";
import { formatNumber, formatPct } from "../lib/format";

function compactNumber(v: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(v);
}

/* ---------- numbered feed card, echoing the research-layer blueprint ---------- */
function FeedCard({ num, title, sub, children }: { num: string; title: string; sub: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--surface-1)]">
      <div className="flex items-baseline gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="text-xs font-bold text-[var(--series-6)]">{num}</span>
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{sub}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (value == null) return null;
  return (
    <div className="flex justify-between gap-3 border-t border-white/5 py-1 first:border-t-0 text-sm">
      <span className="text-[var(--text-muted)]">{label}</span>
      <span className="tabular text-right">{value}</span>
    </div>
  );
}

/* ---------- ticker picker when no symbol is selected ---------- */
function TickerPicker() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SecuritySearchQuote[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .securitiesSearch(q)
        .then((r) => setResults(r.quotes))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  return (
    <Card title="Choisir un titre à analyser">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ticker ou nom de société (AAPL, LVMH, Nestlé…)"
        className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
      />
      <div className="mt-2 divide-y divide-white/5">
        {results.map((r) => (
          <button
            key={r.symbol}
            onClick={() => navigate(`/research/${encodeURIComponent(r.symbol)}`)}
            className="flex w-full items-center justify-between py-2 text-left text-sm hover:bg-white/5"
          >
            <span>
              <span className="font-medium">{r.symbol}</span>{" "}
              <span className="text-[var(--text-secondary)]">— {r.name}</span>
            </span>
            <span className="text-xs text-[var(--text-muted)]">{[r.exchange, r.sector].filter(Boolean).join(" · ")}</span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ---------- risk gate: settings + trade simulation ---------- */
const RULE_ICON: Record<string, string> = { pass: "✓", blocked: "✕", info: "→" };
const RULE_COLOR: Record<string, string> = {
  pass: "var(--status-good)",
  blocked: "var(--status-critical)",
  info: "var(--text-muted)",
};

function RiskGate({ symbol, price, currency, sector }: { symbol: string; price: number; currency: string; sector: string | null }) {
  const [settings, setSettings] = useState<RiskSettings | null>(null);
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<RiskCheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RiskSettings | null>(null);

  useEffect(() => {
    api.riskSettings().then(setSettings).catch(() => undefined);
  }, []);

  useEffect(() => setResult(null), [symbol]);

  async function runCheck() {
    const value = parseFloat(amount.replace(",", "."));
    if (!value || value <= 0) return;
    setBusy(true);
    try {
      setResult(await api.riskCheck({ symbol, amount: value, currency, price, sector }));
    } finally {
      setBusy(false);
    }
  }

  async function toggleKillSwitch() {
    if (!settings) return;
    const next = await api.updateRiskSettings({ kill_switch: !settings.kill_switch });
    setSettings(next);
    setResult(null);
  }

  async function saveSettings() {
    if (!draft) return;
    const next = await api.updateRiskSettings({
      max_position_pct: draft.max_position_pct,
      max_sector_pct: draft.max_sector_pct,
      max_drawdown_pct: draft.max_drawdown_pct,
      stop_loss_pct: draft.stop_loss_pct,
    });
    setSettings(next);
    setEditing(false);
    setResult(null);
  }

  return (
    <Card
      title="Risk Gate — le risque peut bloquer le trade"
      action={
        settings && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setDraft(settings);
                setEditing((v) => !v);
              }}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
            >
              {editing ? "annuler" : "règles"}
            </button>
            <button
              onClick={toggleKillSwitch}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                settings.kill_switch
                  ? "bg-[var(--status-critical)] text-white"
                  : "border border-white/15 text-[var(--text-secondary)] hover:bg-white/5"
              }`}
              title="Arrêt d'urgence: bloque tous les nouveaux trades"
            >
              {settings.kill_switch ? "⏻ KILL SWITCH ACTIF" : "⏻ Kill switch"}
            </button>
          </div>
        )
      }
    >
      {editing && draft ? (
        <div className="space-y-2">
          {(
            [
              ["max_position_pct", "Taille max d'une position (% NAV)"],
              ["max_sector_pct", "Exposition max par secteur (% NAV)"],
              ["max_drawdown_pct", "Gel des trades au-delà d'un drawdown de (%)"],
              ["stop_loss_pct", "Stop loss par défaut (% sous l'entrée)"],
            ] as [keyof RiskSettings, string][]
          ).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[var(--text-secondary)]">{label}</span>
              <input
                type="number"
                step="0.5"
                value={draft[key] as number}
                onChange={(e) => setDraft({ ...draft, [key]: parseFloat(e.target.value) || 0 })}
                className="w-24 rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
              />
            </label>
          ))}
          <button
            onClick={saveSettings}
            className="mt-1 rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            Enregistrer les règles
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <div className="mb-1 text-xs text-[var(--text-muted)]">Montant envisagé ({currency})</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="ex: 50000"
                className="w-36 rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
              />
            </label>
            <button
              onClick={runCheck}
              disabled={busy || !amount}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "…" : "Vérifier le trade"}
            </button>
          </div>

          {result && (
            <>
              <div
                className="rounded px-3 py-2 text-sm font-bold"
                style={{
                  background: result.verdict === "PASS" ? "rgba(12,163,12,0.15)" : "rgba(208,59,59,0.15)",
                  color: result.verdict === "PASS" ? "var(--status-good)" : "var(--status-critical)",
                }}
              >
                {result.verdict === "PASS"
                  ? "✓ TOUTES LES RÈGLES PASSENT — trade autorisé"
                  : "✕ RÈGLES ENFREINTES ? TRADE BLOQUÉ. Aucune exception — la discipline est l'avantage."}
              </div>
              <div className="space-y-1.5">
                {result.rules.map((r) => (
                  <div key={r.key} className="flex gap-2 text-sm">
                    <span className="w-4 shrink-0 text-center font-bold" style={{ color: RULE_COLOR[r.status] }}>
                      {RULE_ICON[r.status]}
                    </span>
                    <span className="w-44 shrink-0 font-medium">{r.label}</span>
                    <span className="text-[var(--text-secondary)]">{r.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {settings && !result && (
            <div className="text-xs leading-relaxed text-[var(--text-muted)]">
              Règles actives : position ≤ {settings.max_position_pct}% NAV · secteur ≤ {settings.max_sector_pct}% ·
              gel au-delà de {settings.max_drawdown_pct}% de drawdown · stop {settings.stop_loss_pct}% sous l'entrée
              {settings.kill_switch && (
                <span className="font-semibold text-[var(--status-critical)]"> · KILL SWITCH ACTIF</span>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/* ---------- the research workspace ---------- */
export function ResearchPage() {
  const { symbol } = useParams();
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!symbol) {
      setOverview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setOverview(null);
    api
      .securityOverview(symbol)
      .then((d) => !cancelled && setOverview(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const q = overview?.quote;
  const f = overview?.fundamentals;
  const trend = f?.analyst.trend;
  const trendTotal = trend ? trend.strong_buy + trend.buy + trend.hold + trend.sell + trend.strong_sell : 0;

  return (
    <div>
      <PageHeader
        title="Recherche Equity"
        subtitle="D'abord, la recherche : prix, news, données, sentiment — puis la décision passe le Risk Gate"
        action={
          symbol && (
            <div className="flex items-center gap-2">
              <Link
                to={`/security/${encodeURIComponent(symbol)}`}
                className="rounded border border-white/15 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
              >
                Page titre complète →
              </Link>
              <Link
                to="/research"
                className="rounded border border-white/15 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
              >
                Changer de titre
              </Link>
            </div>
          )
        }
      />

      {!symbol && <TickerPicker />}
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {overview && q && (
        <div className="space-y-4">
          {/* ---- the four research feeds ---- */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <FeedCard num="01" title="Price Feed" sub="cours, plages">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="tabular text-2xl font-bold">{formatNumber(q.price)}</span>
                <span className="text-xs text-[var(--text-muted)]">{q.currency}</span>
                <span
                  className="tabular text-sm font-semibold"
                  style={{ color: q.change_pct >= 0 ? "var(--status-good)" : "var(--status-critical)" }}
                >
                  {formatPct(q.change_pct, 2)}
                </span>
              </div>
              <Row label="Clôture veille" value={q.previous_close != null ? formatNumber(q.previous_close) : null} />
              <Row
                label="Plage du jour"
                value={q.day_low != null && q.day_high != null ? `${formatNumber(q.day_low)} – ${formatNumber(q.day_high)}` : null}
              />
              <Row
                label="52 semaines"
                value={
                  q.fifty_two_week_low != null && q.fifty_two_week_high != null
                    ? `${formatNumber(q.fifty_two_week_low)} – ${formatNumber(q.fifty_two_week_high)}`
                    : null
                }
              />
              <Row label="Volume" value={q.volume != null ? compactNumber(q.volume) : null} />
            </FeedCard>

            <FeedCard num="02" title="News Feed" sub="titres, événements">
              {overview.news.length === 0 ? (
                <div className="text-sm text-[var(--text-muted)]">Aucune actualité récente.</div>
              ) : (
                <div className="space-y-2">
                  {overview.news.slice(0, 5).map((n, i) => (
                    <a key={i} href={n.link} target="_blank" rel="noreferrer" className="block text-[13px] leading-snug hover:text-[var(--series-1)]">
                      {n.title}
                      <span className="block text-[10px] text-[var(--text-muted)]">{n.publisher}</span>
                    </a>
                  ))}
                </div>
              )}
            </FeedCard>

            <FeedCard num="03" title="Market Data" sub="indicateurs, fondamentaux">
              {f ? (
                <>
                  <Row label="Capitalisation" value={f.valuation.market_cap != null ? compactNumber(f.valuation.market_cap) : null} />
                  <Row label="PER (fwd)" value={f.valuation.forward_pe != null ? formatNumber(f.valuation.forward_pe) : null} />
                  <Row label="PEG" value={f.valuation.peg != null ? formatNumber(f.valuation.peg) : null} />
                  <Row label="Marge nette" value={f.profitability.profit_margin != null ? `${(f.profitability.profit_margin * 100).toFixed(1)}%` : null} />
                  <Row label="ROE" value={f.profitability.roe != null ? `${(f.profitability.roe * 100).toFixed(1)}%` : null} />
                  <Row label="Croissance CA" value={f.profitability.revenue_growth != null ? formatPct(f.profitability.revenue_growth * 100) : null} />
                  <Row label="Dette/FP" value={f.health.debt_to_equity != null ? `${formatNumber(f.health.debt_to_equity, 1)}%` : null} />
                  <Row label="FCF" value={f.health.free_cashflow != null ? compactNumber(f.health.free_cashflow) : null} />
                </>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">Fondamentaux indisponibles pour cet instrument.</div>
              )}
            </FeedCard>

            <FeedCard num="04" title="Sentiment" sub="analystes, positionnement">
              {trend && trendTotal > 0 ? (
                <>
                  <div className="mb-2 flex h-2.5 w-full overflow-hidden rounded">
                    {(
                      [
                        [trend.strong_buy, "var(--status-good)"],
                        [trend.buy, "#66b866"],
                        [trend.hold, "var(--status-warning)"],
                        [trend.sell, "var(--status-serious)"],
                        [trend.strong_sell, "var(--status-critical)"],
                      ] as [number, string][]
                    ).map(([n, color], i) => (n > 0 ? <div key={i} style={{ width: `${(n / trendTotal) * 100}%`, background: color }} /> : null))}
                  </div>
                  <Row label="Analystes" value={String(trendTotal)} />
                  <Row
                    label="Note moyenne"
                    value={f?.analyst.recommendation_mean != null ? `${formatNumber(f.analyst.recommendation_mean, 1)} / 5` : null}
                  />
                  <Row
                    label="Short % flottant"
                    value={f?.ownership.short_percent_float != null ? `${(f.ownership.short_percent_float * 100).toFixed(1)}%` : null}
                  />
                  <Row
                    label="Institutionnels"
                    value={f?.ownership.held_institutions != null ? `${(f.ownership.held_institutions * 100).toFixed(0)}%` : null}
                  />
                </>
              ) : (
                <div className="text-sm text-[var(--text-muted)]">Pas de couverture analystes pour cet instrument.</div>
              )}
            </FeedCard>
          </div>

          {/* ---- decision layer ---- */}
          <div className="grid gap-4 xl:grid-cols-2">
            {overview.valuation ? (
              <ValuationCard valuation={overview.valuation} currency={q.currency} />
            ) : (
              <Card title="Valorisation">
                <div className="text-sm text-[var(--text-muted)]">
                  Pas assez de données fondamentales pour valoriser cet instrument (indices, FX et crypto n'ont pas de
                  juste valeur comptable).
                </div>
              </Card>
            )}
            <RiskGate symbol={q.symbol} price={q.price} currency={q.currency} sector={f?.profile.sector ?? null} />
          </div>

          {/* ---- Taurus composite signal (full strategy: alpha + MM + momentum) ---- */}
          <TaurusSignalCard symbol={q.symbol} />
        </div>
      )}
    </div>
  );
}
