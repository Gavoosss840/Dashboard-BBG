import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDate } from "../lib/format";

const STATUS_LABEL: Record<string, string> = {
  valid: "Valide",
  expiring_soon: "Expire bientôt",
  expired: "Expiré",
  missing: "Manquant",
};

const STATUS_COLOR: Record<string, string> = {
  valid: "var(--status-good)",
  expiring_soon: "var(--status-warning)",
  expired: "var(--status-critical)",
  missing: "var(--text-muted)",
};

const FILTERS = ["all", "expired", "expiring_soon", "missing", "valid"];

export function CompliancePage() {
  const [statusFilter, setStatusFilter] = useState("all");
  const summary = useApi(() => api.complianceSummary(), []);
  const docs = useApi(
    () => api.complianceDocuments(statusFilter === "all" ? undefined : { status: statusFilter }),
    [statusFilter]
  );

  async function renew(id: number) {
    await api.renewDocument(id, 365);
    docs.reload();
    summary.reload();
  }

  if (summary.loading || docs.loading) return <LoadingState />;
  if (summary.error) return <ErrorState message={summary.error} />;
  if (docs.error) return <ErrorState message={docs.error} />;
  if (!summary.data || !docs.data) return null;

  return (
    <div>
      <PageHeader title="Compliance" subtitle="Suivi KYC/AML et échéances de renouvellement de mandat" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Documents valides" value={summary.data.valid} tone="good" />
        <StatTile label="Expirent bientôt (60j)" value={summary.data.expiring_soon} tone={summary.data.expiring_soon > 0 ? "critical" : "neutral"} />
        <StatTile label="Expirés" value={summary.data.expired} tone={summary.data.expired > 0 ? "critical" : "neutral"} />
        <StatTile label="Manquants" value={summary.data.missing} tone={summary.data.missing > 0 ? "critical" : "neutral"} />
      </div>

      <Card className="mt-4" title="Renouvellements de mandat à venir (180j)">
        {summary.data.upcoming_mandate_renewals.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">Aucun renouvellement dans les 180 prochains jours.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Client</th>
                <th className="pb-2">Date de renouvellement</th>
                <th className="pb-2 text-right">Jours restants</th>
                <th className="pb-2 text-right">Préavis requis</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.upcoming_mandate_renewals.map((r) => (
                <tr key={r.mandate_id} className="border-t border-white/5">
                  <td className="py-2">
                    <Link to={`/clients/${r.client_id}`} className="font-medium hover:text-[var(--series-1)]">
                      {r.client_name}
                    </Link>
                  </td>
                  <td className="py-2 text-[var(--text-secondary)]">{formatDate(r.renewal_date)}</td>
                  <td
                    className="tabular py-2 text-right"
                    style={{ color: r.days_to_renewal <= r.notice_period_days ? "var(--status-critical)" : "var(--text-primary)" }}
                  >
                    {r.days_to_renewal}j
                  </td>
                  <td className="tabular py-2 text-right text-[var(--text-muted)]">{r.notice_period_days}j</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card
        className="mt-4"
        title="Documents"
        action={
          <div className="flex gap-1">
            {FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded px-2 py-1 text-xs ${
                  statusFilter === s ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {s === "all" ? "Tout" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        }
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
              <th className="pb-2">Client</th>
              <th className="pb-2">Document</th>
              <th className="pb-2">Émis</th>
              <th className="pb-2">Expire</th>
              <th className="pb-2">Statut</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {docs.data.map((d) => (
              <tr key={d.id} className="border-t border-white/5">
                <td className="py-2">
                  <Link to={`/clients/${d.client_id}`} className="font-medium hover:text-[var(--series-1)]">
                    {d.client_name}
                  </Link>
                </td>
                <td className="py-2 text-[var(--text-secondary)]">{d.doc_type}</td>
                <td className="py-2 text-[var(--text-secondary)]">{d.issued_date ? formatDate(d.issued_date) : "—"}</td>
                <td className="py-2 text-[var(--text-secondary)]">{d.expiry_date ? formatDate(d.expiry_date) : "—"}</td>
                <td className="py-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-xs"
                    style={{ background: "rgba(255,255,255,0.05)", color: STATUS_COLOR[d.status] }}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                </td>
                <td className="py-2 text-right">
                  {d.status !== "valid" && (
                    <button
                      onClick={() => renew(d.id)}
                      className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--status-good)] hover:text-[var(--status-good)]"
                    >
                      Renouveler (1 an)
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
