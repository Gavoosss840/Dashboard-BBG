import { formatMoney } from "../../lib/format";

const SERIES_COLORS = [
  "var(--series-1)",
  "var(--series-2)",
  "var(--series-3)",
  "var(--series-4)",
  "var(--series-5)",
  "var(--series-6)",
  "var(--series-7)",
  "var(--series-8)",
];

export function BreakdownBars({
  data,
  ccy,
  maxItems = 8,
}: {
  data: Record<string, number>;
  ccy: string;
  maxItems?: number;
}) {
  const entries = Object.entries(data)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);
  const shown = entries.slice(0, maxItems);
  const rest = entries.slice(maxItems);
  const restSum = rest.reduce((acc, [, v]) => acc + v, 0);
  const rows = restSum > 0 ? [...shown, ["Autres", restSum] as [string, number]] : shown;
  const total = rows.reduce((acc, [, v]) => acc + v, 0) || 1;
  const max = Math.max(...rows.map(([, v]) => v), 1);

  return (
    <div className="space-y-2.5">
      {rows.map(([label, value], i) => (
        <div key={label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: label === "Autres" ? "var(--text-muted)" : SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {label}
            </span>
            <span className="tabular text-[var(--text-primary)]">
              {formatMoney(value, ccy, { compact: true })}{" "}
              <span className="text-[var(--text-muted)]">({((value / total) * 100).toFixed(1)}%)</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(value / max) * 100}%`,
                background: label === "Autres" ? "var(--text-muted)" : SERIES_COLORS[i % SERIES_COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-sm text-[var(--text-muted)]">Aucune donnée</div>}
    </div>
  );
}
