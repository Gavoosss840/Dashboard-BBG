import type { ReactNode } from "react";

export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "good" | "critical";
}) {
  const toneColor =
    tone === "good" ? "var(--status-good)" : tone === "critical" ? "var(--status-critical)" : "var(--text-primary)";
  return (
    <div className="rounded-lg border border-white/10 bg-[var(--surface-1)] p-4">
      <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{label}</div>
      <div className="tabular mt-2 text-2xl font-semibold" style={{ color: toneColor }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</div>}
    </div>
  );
}
