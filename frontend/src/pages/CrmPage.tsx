import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Modal } from "../components/ui/Modal";
import { CrmContactForm, type CrmContactFormValues } from "../components/forms/CrmContactForm";
import { formatDate, formatMoney } from "../lib/format";
import type { CrmContact } from "../api/types";

const STAGES: { key: string; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "contacted", label: "Contacté" },
  { key: "meeting", label: "Meeting" },
  { key: "negotiation", label: "Négociation" },
  { key: "onboarded", label: "Onboardé" },
  { key: "lost", label: "Perdu" },
];

export function CrmPage() {
  const { data, loading, error, reload } = useApi(() => api.crmContacts(), []);
  const users = useApi(() => api.users(), []);
  const [modal, setModal] = useState<{ type: "new" } | { type: "edit"; contact: CrmContact } | null>(null);

  async function changeStage(contact: CrmContact, stage: string) {
    await api.updateCrmContact(contact.id, { stage });
    reload();
  }

  async function handleSubmit(values: CrmContactFormValues) {
    if (modal?.type === "edit") {
      await api.updateCrmContact(modal.contact.id, values);
    } else {
      await api.createCrmContact(values);
    }
    setModal(null);
    reload();
  }

  async function handleDelete(id: number) {
    await api.deleteCrmContact(id);
    reload();
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="CRM"
        subtitle="Pipeline prospects, clients et partenaires"
        action={
          <button
            onClick={() => setModal({ type: "new" })}
            className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            + Nouveau contact
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const contacts = data.filter((c) => c.stage === stage.key);
          return (
            <div key={stage.key}>
              <div className="mb-2 flex items-center justify-between px-1 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <span>{stage.label}</span>
                <span>{contacts.length}</span>
              </div>
              <div className="space-y-2">
                {contacts.map((c) => (
                  <Card key={c.id} className="text-sm">
                    <div className="flex items-start justify-between">
                      <div className="font-medium">{c.name}</div>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setModal({ type: "edit", contact: c })}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                        >
                          éditer
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Supprimer ce contact ?")) handleDelete(c.id);
                          }}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                        >
                          suppr.
                        </button>
                      </div>
                    </div>
                    <div className="mt-0.5 text-xs capitalize text-[var(--text-muted)]">{c.contact_type} · {c.source}</div>
                    {c.estimated_aum > 0 && (
                      <div className="tabular mt-1 text-xs text-[var(--text-secondary)]">
                        AUM estimé: {formatMoney(c.estimated_aum, c.currency, { compact: true })}
                      </div>
                    )}
                    {c.next_action && (
                      <div className="mt-1 text-xs text-[var(--text-secondary)]">
                        → {c.next_action} {c.next_action_date && `(${formatDate(c.next_action_date)})`}
                      </div>
                    )}
                    <div className="mt-1 text-xs text-[var(--text-muted)]">Owner: {c.owner?.name ?? "—"}</div>
                    <select
                      value={c.stage}
                      onChange={(e) => changeStage(c, e.target.value)}
                      className="mt-2 w-full rounded border border-white/10 bg-[var(--surface-2)] px-1.5 py-1 text-xs"
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </Card>
                ))}
                {contacts.length === 0 && <div className="px-1 text-xs text-[var(--text-muted)]">—</div>}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        title={modal?.type === "edit" ? "Modifier le contact" : "Nouveau contact"}
        wide
      >
        <CrmContactForm
          initial={modal?.type === "edit" ? modal.contact : undefined}
          users={users.data ?? []}
          onSubmit={handleSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>
    </div>
  );
}
