import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDateTime } from "../lib/format";

const METHOD_LABEL: Record<string, string> = {
  POST: "Création",
  PATCH: "Modification",
  PUT: "Modification",
  DELETE: "Suppression",
};

function statusColor(code: number): string {
  if (code < 300) return "var(--status-good)";
  if (code === 403 || code === 429) return "var(--status-warning)";
  return "var(--status-critical)";
}

export function AuditPage() {
  const { data, loading, error } = useApi(() => api.auditLogs(300), []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Journal d'audit"
        subtitle="Trace immuable de toutes les actions de modification — qui, quoi, quand (300 dernières)"
      />
      <Card>
        {data.length === 0 ? (
          <div className="text-sm text-[var(--text-muted)]">Aucune action enregistrée pour l'instant.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Horodatage</th>
                <th className="pb-2">Utilisateur</th>
                <th className="pb-2">Action</th>
                <th className="pb-2">Endpoint</th>
                <th className="pb-2 text-right">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {data.map((log) => (
                <tr key={log.id} className="border-t border-white/5">
                  <td className="tabular py-1.5 text-[var(--text-secondary)]">{formatDateTime(log.timestamp)}</td>
                  <td className="py-1.5 font-medium">{log.user_name}</td>
                  <td className="py-1.5 text-[var(--text-secondary)]">{METHOD_LABEL[log.method] ?? log.method}</td>
                  <td className="py-1.5 font-mono text-xs text-[var(--text-muted)]">{log.path}</td>
                  <td className="tabular py-1.5 text-right" style={{ color: statusColor(log.status_code) }}>
                    {log.status_code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
