import { useState } from "react";
import type { CrmContact, User } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

export interface CrmContactFormValues {
  name: string;
  contact_type: string;
  stage: string;
  source: string;
  estimated_aum: number;
  currency: string;
  owner_id: number | null;
  next_action: string;
  next_action_date: string | null;
  notes: string;
}

const DEFAULTS: CrmContactFormValues = {
  name: "",
  contact_type: "prospect",
  stage: "lead",
  source: "",
  estimated_aum: 0,
  currency: "EUR",
  owner_id: null,
  next_action: "",
  next_action_date: null,
  notes: "",
};

export function CrmContactForm({
  initial,
  users,
  onSubmit,
  onCancel,
}: {
  initial?: CrmContact;
  users: User[];
  onSubmit: (data: CrmContactFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CrmContactFormValues>(
    initial
      ? {
          name: initial.name,
          contact_type: initial.contact_type,
          stage: initial.stage,
          source: initial.source,
          estimated_aum: initial.estimated_aum,
          currency: initial.currency,
          owner_id: initial.owner?.id ?? null,
          next_action: initial.next_action,
          next_action_date: initial.next_action_date,
          notes: initial.notes,
        }
      : DEFAULTS
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CrmContactFormValues>(key: K, value: CrmContactFormValues[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(form);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormGrid>
        <Field label="Nom" span2>
          <input required className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.contact_type} onChange={(e) => set("contact_type", e.target.value)}>
            <option value="prospect">Prospect</option>
            <option value="client">Client</option>
            <option value="partner">Partenaire</option>
            <option value="introducer">Introducteur</option>
          </select>
        </Field>
        <Field label="Étape">
          <select className={inputClass} value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            <option value="lead">Lead</option>
            <option value="contacted">Contacté</option>
            <option value="meeting">Meeting</option>
            <option value="negotiation">Négociation</option>
            <option value="onboarded">Onboardé</option>
            <option value="lost">Perdu</option>
          </select>
        </Field>
        <Field label="Source">
          <input className={inputClass} value={form.source} onChange={(e) => set("source", e.target.value)} />
        </Field>
        <Field label="Owner">
          <select
            className={inputClass}
            value={form.owner_id ?? ""}
            onChange={(e) => set("owner_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Aucun</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="AUM estimé">
          <input
            type="number"
            step="any"
            className={inputClass}
            value={form.estimated_aum}
            onChange={(e) => set("estimated_aum", Number(e.target.value))}
          />
        </Field>
        <Field label="Devise">
          <select className={inputClass} value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prochaine action" span2>
          <input className={inputClass} value={form.next_action} onChange={(e) => set("next_action", e.target.value)} />
        </Field>
        <Field label="Date de la prochaine action">
          <input
            type="date"
            className={inputClass}
            value={form.next_action_date ?? ""}
            onChange={(e) => set("next_action_date", e.target.value || null)}
          />
        </Field>
        <Field label="Notes" span2>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer le contact"} />
    </form>
  );
}
