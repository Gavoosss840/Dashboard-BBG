import { useState } from "react";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
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
  const { currency } = useCurrency();
  const { data, loading, error, reload } = useApi(() => api.crmContacts(), []);
  const [newName, setNewName] = useState("");

  async function addProspect() {
    if (!newName.trim()) return;
    await api.createCrmContact({ name: newName.trim(), contact_type: "prospect", stage: "lead", currency });
    setNewName("");
    reload();
  }

  async function changeStage(contact: CrmContact, stage: string) {
    await api.updateCrmContact(contact.id, { stage });
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
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nouveau prospect…"
              className="rounded border border-white/10 bg-[var(--surface-2)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
            />
            <button
              onClick={addProspect}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              Ajouter
            </button>
          </div>
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
                    <div className="font-medium">{c.name}</div>
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
    </div>
  );
}
