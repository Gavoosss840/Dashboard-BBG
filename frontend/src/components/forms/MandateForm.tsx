import { useState } from "react";
import type { Mandate, MandateInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";

function defaults(clientId: number): MandateInput {
  return {
    client_id: clientId,
    mandate_type: "discretionary",
    status: "active",
    signing_date: new Date().toISOString().slice(0, 10),
    renewal_date: null,
    entry_fee_pct: 0,
    mgmt_fee_pct: 1.5,
    exit_fee_pct: 0,
    perf_fee_pct: 15,
    hurdle_rate_pct: 0,
    high_water_mark: 0,
    benchmark: "",
    notice_period_days: 30,
    document_ref: "",
  };
}

export function MandateForm({
  clientId,
  initial,
  onSubmit,
  onCancel,
}: {
  clientId: number;
  initial?: Mandate;
  onSubmit: (data: MandateInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<MandateInput>(
    initial
      ? {
          client_id: clientId,
          mandate_type: initial.mandate_type,
          status: initial.status,
          signing_date: initial.signing_date,
          renewal_date: initial.renewal_date,
          entry_fee_pct: initial.entry_fee_pct,
          mgmt_fee_pct: initial.mgmt_fee_pct,
          exit_fee_pct: initial.exit_fee_pct,
          perf_fee_pct: initial.perf_fee_pct,
          hurdle_rate_pct: initial.hurdle_rate_pct,
          high_water_mark: initial.high_water_mark,
          benchmark: initial.benchmark,
          notice_period_days: initial.notice_period_days,
          document_ref: initial.document_ref,
        }
      : defaults(clientId)
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof MandateInput>(key: K, value: MandateInput[K]) {
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
        <Field label="Type de mandat">
          <select className={inputClass} value={form.mandate_type} onChange={(e) => set("mandate_type", e.target.value)}>
            <option value="discretionary">Discrétionnaire</option>
            <option value="advisory">Conseil</option>
          </select>
        </Field>
        <Field label="Statut">
          <select className={inputClass} value={form.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Actif</option>
            <option value="pending">En attente</option>
            <option value="terminated">Résilié</option>
          </select>
        </Field>
        <Field label="Date de signature">
          <input type="date" required className={inputClass} value={form.signing_date} onChange={(e) => set("signing_date", e.target.value)} />
        </Field>
        <Field label="Date de renouvellement">
          <input
            type="date"
            className={inputClass}
            value={form.renewal_date ?? ""}
            onChange={(e) => set("renewal_date", e.target.value || null)}
          />
        </Field>
        <Field label="Frais d'entrée (%)">
          <input type="number" step="0.01" className={inputClass} value={form.entry_fee_pct} onChange={(e) => set("entry_fee_pct", Number(e.target.value))} />
        </Field>
        <Field label="Frais de gestion (%)">
          <input type="number" step="0.01" className={inputClass} value={form.mgmt_fee_pct} onChange={(e) => set("mgmt_fee_pct", Number(e.target.value))} />
        </Field>
        <Field label="Frais de sortie (%)">
          <input type="number" step="0.01" className={inputClass} value={form.exit_fee_pct} onChange={(e) => set("exit_fee_pct", Number(e.target.value))} />
        </Field>
        <Field label="Performance fee (%)">
          <input type="number" step="0.1" className={inputClass} value={form.perf_fee_pct} onChange={(e) => set("perf_fee_pct", Number(e.target.value))} />
        </Field>
        <Field label="Hurdle rate (%)">
          <input type="number" step="0.1" className={inputClass} value={form.hurdle_rate_pct} onChange={(e) => set("hurdle_rate_pct", Number(e.target.value))} />
        </Field>
        <Field label="High-Water Mark">
          <input type="number" step="0.01" className={inputClass} value={form.high_water_mark} onChange={(e) => set("high_water_mark", Number(e.target.value))} />
        </Field>
        <Field label="Benchmark">
          <input className={inputClass} value={form.benchmark} onChange={(e) => set("benchmark", e.target.value)} />
        </Field>
        <Field label="Préavis (jours)">
          <input type="number" className={inputClass} value={form.notice_period_days} onChange={(e) => set("notice_period_days", Number(e.target.value))} />
        </Field>
        <Field label="Référence document" span2>
          <input className={inputClass} value={form.document_ref} onChange={(e) => set("document_ref", e.target.value)} />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer le mandat"} />
    </form>
  );
}
