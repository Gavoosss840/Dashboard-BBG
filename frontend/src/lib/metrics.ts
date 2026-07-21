// Catalog of optional columns the user can toggle on the watchlist and on
// portfolio positions. Each metric knows how to format its raw value; values
// come from GET /api/securities/metrics (Yahoo fundamentals + quote), keyed by
// the same identifiers used here.

export type MetricValue = number | string | null | undefined;

export type MetricFormat =
  | "money"        // large money, compact (market cap...)
  | "price"        // plain number, 2 decimals
  | "ratio"        // x.xx
  | "pct"          // already a fraction (0.12 -> 12.0%)
  | "pct_direct"   // already a percentage (1.11 -> 1.11%)
  | "int"          // integer, thousands separators
  | "text";

export interface MetricDef {
  key: string;
  label: string;      // short column header
  full: string;       // tooltip / picker label
  group: string;
  format: MetricFormat;
  align: "left" | "right";
}

export const METRIC_CATALOG: MetricDef[] = [
  // Marché / prix
  { key: "day_change_pct", label: "Var. j", full: "Variation du jour", group: "Marché", format: "pct_direct", align: "right" },
  { key: "market_cap", label: "Cap.", full: "Capitalisation boursière", group: "Marché", format: "money", align: "right" },
  { key: "volume", label: "Volume", full: "Volume du jour", group: "Marché", format: "int", align: "right" },
  { key: "avg_volume", label: "Vol. moy", full: "Volume moyen", group: "Marché", format: "int", align: "right" },
  { key: "fifty_two_week_high", label: "52s haut", full: "Plus haut 52 semaines", group: "Marché", format: "price", align: "right" },
  { key: "fifty_two_week_low", label: "52s bas", full: "Plus bas 52 semaines", group: "Marché", format: "price", align: "right" },
  { key: "beta", label: "Bêta", full: "Bêta (5 ans)", group: "Marché", format: "ratio", align: "right" },
  // Valorisation
  { key: "trailing_pe", label: "P/E", full: "P/E (12m glissants)", group: "Valorisation", format: "ratio", align: "right" },
  { key: "forward_pe", label: "P/E fwd", full: "P/E prévisionnel", group: "Valorisation", format: "ratio", align: "right" },
  { key: "peg", label: "PEG", full: "Ratio PEG", group: "Valorisation", format: "ratio", align: "right" },
  { key: "price_to_book", label: "P/B", full: "Cours / actif net", group: "Valorisation", format: "ratio", align: "right" },
  { key: "price_to_sales", label: "P/S", full: "Cours / ventes", group: "Valorisation", format: "ratio", align: "right" },
  { key: "ev_to_ebitda", label: "EV/EBITDA", full: "Valeur d'entreprise / EBITDA", group: "Valorisation", format: "ratio", align: "right" },
  { key: "eps", label: "BPA", full: "Bénéfice par action", group: "Valorisation", format: "price", align: "right" },
  { key: "forward_eps", label: "BPA fwd", full: "BPA prévisionnel", group: "Valorisation", format: "price", align: "right" },
  { key: "target_mean", label: "Objectif", full: "Objectif de cours moyen (analystes)", group: "Valorisation", format: "price", align: "right" },
  // Rentabilité
  { key: "profit_margin", label: "Marge net", full: "Marge nette", group: "Rentabilité", format: "pct", align: "right" },
  { key: "operating_margin", label: "Marge op.", full: "Marge opérationnelle", group: "Rentabilité", format: "pct", align: "right" },
  { key: "gross_margin", label: "Marge brute", full: "Marge brute", group: "Rentabilité", format: "pct", align: "right" },
  { key: "roe", label: "ROE", full: "Rentabilité des capitaux propres", group: "Rentabilité", format: "pct", align: "right" },
  { key: "roa", label: "ROA", full: "Rentabilité des actifs", group: "Rentabilité", format: "pct", align: "right" },
  { key: "revenue_growth", label: "Crois. CA", full: "Croissance du chiffre d'affaires", group: "Rentabilité", format: "pct", align: "right" },
  { key: "earnings_growth", label: "Crois. bén.", full: "Croissance des bénéfices", group: "Rentabilité", format: "pct", align: "right" },
  // Solidité
  { key: "debt_to_equity", label: "Dette/CP", full: "Dette / capitaux propres", group: "Solidité", format: "ratio", align: "right" },
  { key: "current_ratio", label: "Liquidité", full: "Ratio de liquidité générale", group: "Solidité", format: "ratio", align: "right" },
  { key: "short_percent_float", label: "Short %", full: "% du flottant vendu à découvert", group: "Solidité", format: "pct", align: "right" },
  // Dividende
  { key: "dividend_yield", label: "Rdt div.", full: "Rendement du dividende", group: "Dividende", format: "pct", align: "right" },
  { key: "payout_ratio", label: "Payout", full: "Taux de distribution", group: "Dividende", format: "pct", align: "right" },
  // Profil
  { key: "sector", label: "Secteur", full: "Secteur", group: "Profil", format: "text", align: "left" },
  { key: "industry", label: "Industrie", full: "Industrie", group: "Profil", format: "text", align: "left" },
  { key: "recommendation", label: "Reco", full: "Recommandation analystes", group: "Profil", format: "text", align: "left" },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(
  METRIC_CATALOG.map((m) => [m.key, m])
);

export function formatMetric(value: MetricValue, format: MetricFormat): string {
  if (value === null || value === undefined || value === "") return "—";
  if (format === "text") return String(value);
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";
  switch (format) {
    case "money": {
      const abs = Math.abs(n);
      if (abs >= 1e12) return `${(n / 1e12).toFixed(2)} T`;
      if (abs >= 1e9) return `${(n / 1e9).toFixed(2)} Md`;
      if (abs >= 1e6) return `${(n / 1e6).toFixed(1)} M`;
      return n.toLocaleString("fr-FR");
    }
    case "int":
      return Math.round(n).toLocaleString("fr-FR");
    case "price":
      return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case "ratio":
      return n.toFixed(2);
    case "pct":
      return `${(n * 100).toFixed(1)}%`;
    case "pct_direct":
      return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
    default:
      return String(value);
  }
}

// Persisted per-table column selection.
export function loadMetricColumns(tableKey: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(`metric-columns:${tableKey}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((k) => typeof k === "string" && k in METRIC_BY_KEY);
  } catch {
    /* ignore */
  }
  return fallback;
}

export function saveMetricColumns(tableKey: string, keys: string[]): void {
  try {
    localStorage.setItem(`metric-columns:${tableKey}`, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}
