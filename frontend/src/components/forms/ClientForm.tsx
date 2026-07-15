import { useState } from "react";
import type { Client, ClientInput, User } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

const DEFAULTS: ClientInput = {
  name: "",
  client_type: "individual",
  status: "active",
  entry_date: new Date().toISOString().slice(0, 10),
  base_currency: "EUR",
  country: "",
  email: "",
  phone: "",
  risk_profile: "balanced",
  kyc_status: "pending",
  relationship_manager_id: null,
  notes: "",
};

export function ClientForm({
  initial,
  users,
  onSubmit,
  onCancel,
}: {
  initial?: Client;
  users: User[];
  onSubmit: (data: ClientInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ClientInput>(
    initial
      ? {
          name: initial.name,
          client_type: initial.client_type,
          status: initial.status,
          entry_date: initial.entry_date,
          base_currency: initial.base_currency,
          country: initial.country,
          email: initial.email,
          phone: initial.phone,
          risk_profile: initial.risk_profile,
          kyc_status: initial.kyc_status,
          relationship_manager_id: initial.relationship_manager?.id ?? null,
          notes: initial.notes,
        }
      : DEFAULTS
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof ClientInput>(key: K, value: ClientInput[K]) {
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
          <select className={inputClass} value={form.client_type} onChange={(e) => set("client_type", e.target.value)}>
            <option value="individual">Individuel</option>
            <option value="entity">Entité</option>
          </select>
        </Field>
        <Field label="Statut">
          <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Actif</option>
            <option value="prospect">Prospect</option>
            <option value="closed">Clôturé</option>
          </select>
        </Field>
        <Field label="Entrée sous mandat">
          <input
            type="date"
            required
            className={inputClass}
            value={form.entry_date}
            onChange={(e) => set("entry_date", e.target.value)}
          />
        </Field>
        <Field label="Devise de référence">
          <select className={inputClass} value={form.base_currency} onChange={(e) => set("base_currency", e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Pays">
          <input className={inputClass} value={form.country} onChange={(e) => set("country", e.target.value)} />
        </Field>
        <Field label="Profil de risque">
          <select className={inputClass} value={form.risk_profile} onChange={(e) => set("risk_profile", e.target.value)}>
            <option value="conservative">Conservateur</option>
            <option value="balanced">Équilibré</option>
            <option value="growth">Croissance</option>
          </select>
        </Field>
        <Field label="Statut KYC">
          <select className={inputClass} value={form.kyc_status} onChange={(e) => set("kyc_status", e.target.value)}>
            <option value="pending">En attente</option>
            <option value="verified">Vérifié</option>
            <option value="expired">Expiré</option>
          </select>
        </Field>
        <Field label="Email">
          <input type="email" className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Téléphone">
          <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Gérant relation">
          <select
            className={inputClass}
            value={form.relationship_manager_id ?? ""}
            onChange={(e) => set("relationship_manager_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Aucun</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" span2>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer le client"} />
    </form>
  );
}
