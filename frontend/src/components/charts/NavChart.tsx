import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { NavPoint } from "../../api/types";
import { formatDate, formatMoney } from "../../lib/format";

export function NavChart({ data, ccy }: { data: NavPoint[]; ccy: string }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-[var(--text-muted)]">Aucune donnée</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="navFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--gridline)" strokeDasharray="0" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(v) => formatDate(v)}
          stroke="var(--baseline)"
          tick={{ fill: "var(--text-muted)", fontSize: 11 }}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={(v) => formatMoney(v, ccy, { compact: true })}
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
          labelFormatter={(v) => formatDate(v as string)}
          formatter={(value) => [formatMoney(Number(value), ccy), "NAV"]}
        />
        <Area type="monotone" dataKey="nav" stroke="var(--series-1)" strokeWidth={2} fill="url(#navFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
