import { useState } from "react";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Badge } from "../components/ui/Badge";
import { formatDate, formatMoney } from "../lib/format";

const STATUS_OPTIONS = ["all", "draft", "invoiced", "pending", "paid"];

export function FinancierPage() {
  const { currency } = useCurrency();
  const [statusFilter, setStatusFilter] = useState("all");
  const summary = useApi(() => api.financierSummary(currency), [currency]);
  const txns = useApi(
    () => api.transactions(statusFilter === "all" ? undefined : { status: statusFilter }),
    [statusFilter]
  );

  async function markPaid(id: number) {
    await api.updateTransactionStatus(id, "paid", new Date().toISOString().slice(0, 10));
    txns.reload();
  }

  if (summary.loading || txns.loading) return <LoadingState />;
  if (summary.error) return <ErrorState message={summary.error} />;
  if (txns.error) return <ErrorState message={txns.error} />;
  if (!summary.data || !txns.data) return null;

  return (
    <div>
      <PageHeader title="Financier" subtitle="Tracker des transactions et frais entre Boulet Capital et ses clients" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="Fees en attente" value={formatMoney(summary.data.pending, currency, { compact: true })} />
        <StatTile
          label="Fees en retard"
          value={formatMoney(summary.data.overdue, currency, { compact: true })}
          tone={summary.data.overdue > 0 ? "critical" : "neutral"}
        />
        <StatTile label="Encaissé cette année" value={formatMoney(summary.data.paid_ytd, currency, { compact: true })} tone="good" />
      </div>

      <Card
        className="mt-4"
        title="Transactions"
        action={
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2 py-1 text-xs capitalize ${
                  statusFilter === s ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
              <th className="pb-2">Référence</th>
              <th className="pb-2">Client</th>
              <th className="pb-2">Type</th>
              <th className="pb-2">Émission</th>
              <th className="pb-2">Échéance</th>
              <th className="pb-2 text-right">Montant</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {txns.data.map((t) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="py-2 text-[var(--text-muted)]">{t.invoice_ref}</td>
                <td className="py-2 font-medium">{t.client_name}</td>
                <td className="py-2 capitalize text-[var(--text-secondary)]">{t.transaction_type.replace(/_/g, " ")}</td>
                <td className="py-2 text-[var(--text-secondary)]">{formatDate(t.issue_date)}</td>
                <td className="py-2 text-[var(--text-secondary)]">{t.due_date ? formatDate(t.due_date) : "—"}</td>
                <td className="tabular py-2 text-right">{formatMoney(t.amount, t.currency)}</td>
                <td className="py-2">
                  <Badge label={t.status} />
                </td>
                <td className="py-2 text-right">
                  {t.status !== "paid" && (
                    <button
                      onClick={() => markPaid(t.id)}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--status-good)] hover:text-[var(--status-good)]"
                    >
                      Marquer payé
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
