import { useState } from "react";
import type { CashFlow, CashFlowInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

export function CashFlowForm({
  defaultCurrency,
  initial,
  onSubmit,
  onCancel,
}: {
  defaultCurrency: string;
  initial?: CashFlow;
  onSubmit: (data: CashFlowInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<CashFlowInput>({
    date: initial?.date ?? new Date().toISOString().slice(0, 10),
    flow_type: initial?.flow_type ?? "deposit",
    amount: initial?.amount ?? 0,
    currency: initial?.currency ?? defaultCurrency,
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof CashFlowInput>(key: K, value: CashFlowInput[K]) {
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
        <Field label="Type">
          <select className={inputClass} value={form.flow_type} onChange={(e) => set("flow_type", e.target.value)}>
            <option value="deposit">Dépôt</option>
            <option value="withdrawal">Retrait</option>
          </select>
        </Field>
        <Field label="Date">
          <input type="date" required className={inputClass} value={form.date} onChange={(e) => set("date", e.target.value)} />
        </Field>
        <Field label="Montant">
          <input type="number" step="any" required className={inputClass} value={form.amount} onChange={(e) => set("amount", Number(e.target.value))} />
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
      </FormGrid>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Si le mandat actif prévoit des frais d'entrée/sortie, une transaction correspondante sera générée automatiquement
        (visible dans Financier).
      </p>
      <FormActions onCancel={onCancel} busy={busy} submitLabel="Enregistrer" />
    </form>
  );
}
