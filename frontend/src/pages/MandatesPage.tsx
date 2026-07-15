import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Badge } from "../components/ui/Badge";
import { formatDate } from "../lib/format";

export function MandatesPage() {
  const { data, loading, error } = useApi(() => api.mandates(), []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Mandats de gestion" subtitle={`Répertoire des ${data.length} mandats`} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Référence</th>
                <th className="pb-2">Client</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Signature</th>
                <th className="pb-2">Renouvellement</th>
                <th className="pb-2">Frais entrée</th>
                <th className="pb-2">Frais gestion</th>
                <th className="pb-2">Frais sortie</th>
                <th className="pb-2">Perf. fee</th>
                <th className="pb-2">Hurdle</th>
                <th className="pb-2">Benchmark</th>
                <th className="pb-2">Préavis</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-2 text-[var(--text-muted)]">{m.document_ref}</td>
                  <td className="py-2">
                    <Link to={`/clients/${m.client_id}`} className="font-medium hover:text-[var(--series-1)]">
                      {m.client_name}
                    </Link>
                  </td>
                  <td className="py-2 capitalize text-[var(--text-secondary)]">{m.mandate_type}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{formatDate(m.signing_date)}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{m.renewal_date ? formatDate(m.renewal_date) : "—"}</td>
                  <td className="tabular py-2">{m.entry_fee_pct > 0 ? `${m.entry_fee_pct}%` : "—"}</td>
                  <td className="tabular py-2">{m.mgmt_fee_pct}%</td>
                  <td className="tabular py-2">{m.exit_fee_pct > 0 ? `${m.exit_fee_pct}%` : "—"}</td>
                  <td className="tabular py-2">{m.perf_fee_pct}%</td>
                  <td className="tabular py-2">{m.hurdle_rate_pct > 0 ? `${m.hurdle_rate_pct}%` : "—"}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{m.benchmark}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{m.notice_period_days}j</td>
                  <td className="py-2">
                    <Badge label={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
