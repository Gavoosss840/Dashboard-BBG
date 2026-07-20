import { useState } from "react";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Badge } from "../components/ui/Badge";
import { Modal } from "../components/ui/Modal";
import { AumTargetForm } from "../components/forms/AumTargetForm";
import { formatDate, formatMoney } from "../lib/format";
import type { AumTarget, AumTargetInput } from "../api/types";

const STATUS_OPTIONS = ["all", "draft", "invoiced", "pending", "paid"];

export function FinancierPage() {
  const { currency } = useCurrency();
  const [statusFilter, setStatusFilter] = useState("all");
  const summary = useApi(() => api.financierSummary(currency), [currency]);
  const txns = useApi(
    () => api.transactions(statusFilter === "all" ? undefined : { status: statusFilter }),
    [statusFilter]
  );
  const feePreview = useApi(() => api.feeEnginePreview(currency), [currency]);
  const aumTargets = useApi(() => api.aumTargets(currency), [currency]);
  const [busyMandateId, setBusyMandateId] = useState<number | null>(null);
  const [targetModal, setTargetModal] = useState<{ type: "new" } | { type: "edit"; target: AumTarget } | null>(null);

  async function handleTargetSubmit(payload: AumTargetInput) {
    if (targetModal?.type === "edit") {
      await api.updateAumTarget(targetModal.target.id, payload, currency);
    } else {
      await api.createAumTarget(payload, currency);
    }
    setTargetModal(null);
    aumTargets.reload();
  }

  async function handleDeleteTarget(id: number) {
    await api.deleteAumTarget(id);
    aumTargets.reload();
  }

  async function markPaid(id: number) {
    await api.updateTransactionStatus(id, "paid", new Date().toISOString().slice(0, 10));
    txns.reload();
  }

  async function generateMgmtFee(mandateId: number) {
    setBusyMandateId(mandateId);
    try {
      await api.generateManagementFee(mandateId);
      feePreview.reload();
      txns.reload();
    } finally {
      setBusyMandateId(null);
    }
  }

  async function crystallize(mandateId: number) {
    setBusyMandateId(mandateId);
    try {
      await api.crystallizePerformanceFee(mandateId);
      feePreview.reload();
      txns.reload();
    } finally {
      setBusyMandateId(null);
    }
  }

  if (summary.loading || txns.loading) return <LoadingState />;
  if (summary.error) return <ErrorState message={summary.error} />;
  if (txns.error) return <ErrorState message={txns.error} />;
  if (!summary.data || !txns.data) return null;

  return (
    <div>
      <PageHeader title="Financier" subtitle="Tracker des transactions et frais entre B. Horizon Capital et ses clients" />

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
        title="Objectifs d'AUM"
        action={
          <button
            onClick={() => setTargetModal({ type: "new" })}
            className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
          >
            + Objectif
          </button>
        }
      >
        {aumTargets.loading && <LoadingState />}
        {aumTargets.error && <ErrorState message={aumTargets.error} />}
        {aumTargets.data && aumTargets.data.length === 0 && (
          <div className="text-sm text-[var(--text-muted)]">Aucun objectif défini.</div>
        )}
        {aumTargets.data && aumTargets.data.length > 0 && (
          <div className="space-y-4">
            {aumTargets.data.map((t) => (
              <div key={t.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {t.label} {t.target_date && <span className="text-xs font-normal text-[var(--text-muted)]">— {formatDate(t.target_date)}</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular text-xs text-[var(--text-secondary)]">
                      {formatMoney(t.current_aum, currency, { compact: true })} / {formatMoney(t.target_amount, t.currency, { compact: true })}{" "}
                      ({t.progress_pct.toFixed(0)}%)
                    </span>
                    <button
                      onClick={() => setTargetModal({ type: "edit", target: t })}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                    >
                      modifier
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm("Supprimer cet objectif ?")) handleDeleteTarget(t.id);
                      }}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                    >
                      suppr.
                    </button>
                  </div>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-[var(--series-1)]"
                    style={{ width: `${Math.min(t.progress_pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-4" title="Fee Engine" action={<span className="text-xs text-[var(--text-muted)]">Calcul live par mandat</span>}>
        {feePreview.loading && <LoadingState />}
        {feePreview.error && <ErrorState message={feePreview.error} />}
        {feePreview.data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Client</th>
                <th className="pb-2">Période accrual</th>
                <th className="pb-2 text-right">NAV</th>
                <th className="pb-2 text-right">Frais gestion accru</th>
                <th className="pb-2"></th>
                <th className="pb-2 text-right">HWM</th>
                <th className="pb-2 text-right">Perf. fee accrue</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {feePreview.data.map((f) => (
                <tr key={f.mandate_id} className="border-t border-white/5">
                  <td className="py-2 font-medium">{f.client_name}</td>
                  <td className="py-2 text-xs text-[var(--text-secondary)]">
                    {formatDate(f.period_start)} → {formatDate(f.period_end)}
                  </td>
                  <td className="tabular py-2 text-right">{formatMoney(f.current_nav, currency, { compact: true })}</td>
                  <td className="tabular py-2 text-right">
                    {formatMoney(f.accrued_mgmt_fee, currency)}{" "}
                    <span className="text-xs text-[var(--text-muted)]">({f.mgmt_fee_pct}%)</span>
                  </td>
                  <td className="py-2 text-right">
                    <button
                      disabled={!f.mgmt_fee_invoiceable || busyMandateId === f.mandate_id}
                      onClick={() => generateMgmtFee(f.mandate_id)}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] enabled:hover:border-[var(--series-1)] enabled:hover:text-[var(--series-1)] disabled:opacity-30"
                    >
                      Générer facture
                    </button>
                  </td>
                  <td className="tabular py-2 text-right">{formatMoney(f.high_water_mark, currency, { compact: true })}</td>
                  <td className="tabular py-2 text-right">
                    {formatMoney(f.accrued_perf_fee, currency)}
                    {f.hurdle_rate_pct > 0 && <span className="text-xs text-[var(--text-muted)]"> (hurdle {f.hurdle_rate_pct}%)</span>}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      disabled={!f.perf_fee_crystallizable || busyMandateId === f.mandate_id}
                      onClick={() => crystallize(f.mandate_id)}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] enabled:hover:border-[var(--status-good)] enabled:hover:text-[var(--status-good)] disabled:opacity-30"
                    >
                      Cristalliser
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

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

      <Modal
        open={targetModal !== null}
        onClose={() => setTargetModal(null)}
        title={targetModal?.type === "edit" ? "Modifier l'objectif" : "Nouvel objectif d'AUM"}
      >
        <AumTargetForm
          initial={targetModal?.type === "edit" ? targetModal.target : undefined}
          defaultCurrency={currency}
          onSubmit={handleTargetSubmit}
          onCancel={() => setTargetModal(null)}
        />
      </Modal>
    </div>
  );
}
