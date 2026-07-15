import { useState } from "react";
import type { AumTarget, AumTargetInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

export function AumTargetForm({
  initial,
  defaultCurrency,
  onSubmit,
  onCancel,
}: {
  initial?: AumTarget;
  defaultCurrency: string;
  onSubmit: (data: AumTargetInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<AumTargetInput>(
    initial
      ? {
          label: initial.label,
          target_amount: initial.target_amount,
          currency: initial.currency,
          target_date: initial.target_date,
          notes: initial.notes,
        }
      : { label: "", target_amount: 0, currency: defaultCurrency, target_date: null, notes: "" }
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof AumTargetInput>(key: K, value: AumTargetInput[K]) {
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
        <Field label="Libellé" span2>
          <input required className={inputClass} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="Ex: Objectif fin 2026" />
        </Field>
        <Field label="AUM cible">
          <input type="number" step="any" required className={inputClass} value={form.target_amount} onChange={(e) => set("target_amount", Number(e.target.value))} />
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
        <Field label="Date cible (optionnel)" span2>
          <input type="date" className={inputClass} value={form.target_date ?? ""} onChange={(e) => set("target_date", e.target.value || null)} />
        </Field>
        <Field label="Notes" span2>
          <textarea className={inputClass} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer l'objectif"} />
    </form>
  );
}
