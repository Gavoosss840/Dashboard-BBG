import { formatMoney } from "../../lib/format";

export function PnlValue({ amount, ccy, compact = false }: { amount: number; ccy: string; compact?: boolean }) {
  const color = amount > 0 ? "var(--status-good)" : amount < 0 ? "var(--status-critical)" : "var(--text-secondary)";
  const sign = amount > 0 ? "+" : "";
  return (
    <span className="tabular" style={{ color }}>
      {sign}
      {formatMoney(amount, ccy, { compact })}
    </span>
  );
}
