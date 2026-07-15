import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Modal } from "../components/ui/Modal";
import { UserForm } from "../components/forms/UserForm";
import { formatDate } from "../lib/format";
import type { User, UserInput } from "../api/types";

export function UsersPage() {
  const { data, loading, error, reload } = useApi(() => api.users(), []);
  const [modal, setModal] = useState<{ type: "new" } | { type: "edit"; user: User } | null>(null);

  async function handleSubmit(payload: UserInput) {
    if (modal?.type === "edit") {
      await api.updateUser(modal.user.id, payload);
    } else {
      await api.createUser(payload);
    }
    setModal(null);
    reload();
  }

  async function handleDelete(id: number) {
    await api.deleteUser(id);
    reload();
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="Fondateur et associés de Boulet Capital"
        action={
          <button
            onClick={() => setModal({ type: "new" })}
            className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            + Nouvel utilisateur
          </button>
        }
      />
      {data.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Aucun utilisateur pour l'instant. Ajoute-toi (ou tes associés) avec "+ Nouvel utilisateur".
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((u) => (
            <Card key={u.id}>
              <div className="flex items-start justify-between gap-3">
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
                <div className="flex shrink-0 gap-1.5">
                  <button
                    onClick={() => setModal({ type: "edit", user: u })}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                  >
                    éditer
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Supprimer ${u.name} ?`)) handleDelete(u.id);
                    }}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                  >
                    suppr.
                  </button>
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
      )}

      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal?.type === "edit" ? "Modifier l'utilisateur" : "Nouvel utilisateur"}>
        <UserForm initial={modal?.type === "edit" ? modal.user : undefined} onSubmit={handleSubmit} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}
