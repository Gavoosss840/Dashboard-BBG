import { useState } from "react";
import type { Portfolio, PortfolioInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

function defaults(clientId: number): PortfolioInput {
  return {
    client_id: clientId,
    ptf_id: "",
    base_currency: "EUR",
    strategy_bucket: "stock_picking",
    custodian: "Interactive Brokers",
    inception_nav: 0,
  };
}

export function PortfolioForm({
  clientId,
  initial,
  onSubmit,
  onCancel,
}: {
  clientId: number;
  initial?: Portfolio;
  onSubmit: (data: PortfolioInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PortfolioInput>(
    initial
      ? {
          client_id: clientId,
          ptf_id: initial.ptf_id,
          base_currency: initial.base_currency,
          strategy_bucket: initial.strategy_bucket,
          custodian: initial.custodian,
          inception_nav: initial.inception_nav,
        }
      : defaults(clientId)
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PortfolioInput>(key: K, value: PortfolioInput[K]) {
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
        <Field label="ID Portefeuille (ex: compte IBKR)">
          <input required className={inputClass} value={form.ptf_id} onChange={(e) => set("ptf_id", e.target.value)} />
        </Field>
        <Field label="Devise de base">
          <select className={inputClass} value={form.base_currency} onChange={(e) => set("base_currency", e.target.value)}>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Poche de stratégie">
          <select className={inputClass} value={form.strategy_bucket} onChange={(e) => set("strategy_bucket", e.target.value)}>
            <option value="stock_picking">Stock Picking</option>
            <option value="algo_arbitrage">Arbitrage Algorithmique</option>
            <option value="mixed">Mixte</option>
          </select>
        </Field>
        <Field label="Custodian">
          <input className={inputClass} value={form.custodian} onChange={(e) => set("custodian", e.target.value)} />
        </Field>
        <Field label="NAV à l'inception" span2>
          <input
            type="number"
            step="0.01"
            className={inputClass}
            value={form.inception_nav}
            onChange={(e) => set("inception_nav", Number(e.target.value))}
          />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer le portefeuille"} />
    </form>
  );
}
