import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDate } from "../lib/format";

export function UsersPage() {
  const { data, loading, error } = useApi(() => api.users(), []);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Users" subtitle="Fondateur et associés de Boulet Capital" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.map((u) => (
          <Card key={u.id}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--series-1)]/20 text-sm font-semibold text-[var(--series-1)]">
                {u.avatar_initials}
              </div>
              <div className="min-w-0">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-[var(--text-muted)]">{u.title}</div>
                <span className="mt-1 inline-block rounded bg-white/5 px-1.5 py-0.5 text-xs capitalize text-[var(--text-secondary)]">
                  {u.role}
                </span>
              </div>
            </div>
            <p className="mt-3 text-sm text-[var(--text-secondary)]">{u.bio}</p>
            <dl className="mt-3 space-y-1 text-xs text-[var(--text-muted)]">
              <div className="flex justify-between">
                <dt>Email</dt>
                <dd className="text-[var(--text-secondary)]">{u.email}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Téléphone</dt>
                <dd className="text-[var(--text-secondary)]">{u.phone}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Depuis</dt>
                <dd className="text-[var(--text-secondary)]">{formatDate(u.joined_date)}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}
