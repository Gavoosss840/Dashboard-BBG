import { useState } from "react";
import type { RecurringContribution, RecurringContributionInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

export function RecurringContributionForm({
  defaultCurrency,
  initial,
  onSubmit,
  onCancel,
}: {
  defaultCurrency: string;
  initial?: RecurringContribution;
  onSubmit: (data: RecurringContributionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<RecurringContributionInput>({
    flow_type: initial?.flow_type ?? "deposit",
    amount: initial?.amount ?? 0,
    currency: initial?.currency ?? defaultCurrency,
    day_of_month: initial?.day_of_month ?? 5,
    label: initial?.label ?? "DCA mensuel",
    active: initial?.active ?? true,
    start_date: initial?.start_date ?? new Date().toISOString().slice(0, 10),
    end_date: initial?.end_date ?? null,
  });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof RecurringContributionInput>(key: K, value: RecurringContributionInput[K]) {
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
        <Field label="Libellé">
          <input className={inputClass} value={form.label} onChange={(e) => set("label", e.target.value)} />
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.flow_type} onChange={(e) => set("flow_type", e.target.value)}>
            <option value="deposit">Dépôt</option>
            <option value="withdrawal">Retrait</option>
          </select>
        </Field>
        <Field label="Montant">
          <input
            type="number"
            step="any"
            required
            className={inputClass}
            value={form.amount}
            onChange={(e) => set("amount", Number(e.target.value))}
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
        <Field label="Jour du mois (1-28)">
          <input
            type="number"
            min={1}
            max={28}
            required
            className={inputClass}
            value={form.day_of_month}
            onChange={(e) => set("day_of_month", Number(e.target.value))}
          />
        </Field>
        <Field label="Date de début">
          <input
            type="date"
            required
            className={inputClass}
            value={form.start_date}
            onChange={(e) => set("start_date", e.target.value)}
          />
        </Field>
        <Field label="Date de fin (optionnel)">
          <input
            type="date"
            className={inputClass}
            value={form.end_date ?? ""}
            onChange={(e) => set("end_date", e.target.value || null)}
          />
        </Field>
        <Field label="Active">
          <select
            className={inputClass}
            value={form.active ? "1" : "0"}
            onChange={(e) => set("active", e.target.value === "1")}
          >
            <option value="1">Oui</option>
            <option value="0">Non (suspendue)</option>
          </select>
        </Field>
      </FormGrid>
      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Génère automatiquement le {form.flow_type === "deposit" ? "dépôt" : "retrait"} chaque mois au jour indiqué
        (limité au 1-28 pour rester valide tous les mois). Les frais d'entrée/sortie du mandat actif s'appliquent
        comme pour un dépôt/retrait manuel.
      </p>
      <FormActions onCancel={onCancel} busy={busy} submitLabel="Enregistrer" />
    </form>
  );
}
