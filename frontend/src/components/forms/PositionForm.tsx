import { useState } from "react";
import type { Position, PositionInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";
import { SUPPORTED_CURRENCIES } from "../../context/CurrencyContext";

const DEFAULTS: PositionInput = {
  ticker: "",
  name: "",
  asset_class: "equity",
  sector: "",
  region: "",
  currency: "USD",
  quantity: 0,
  avg_cost: 0,
  last_price: 0,
  data_symbol: "",
};

export function PositionForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: Position;
  onSubmit: (data: PositionInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<PositionInput>(
    initial
      ? {
          ticker: initial.ticker,
          name: initial.name,
          asset_class: initial.asset_class,
          sector: initial.sector,
          region: initial.region,
          currency: initial.currency,
          quantity: initial.quantity,
          avg_cost: initial.avg_cost,
          last_price: initial.last_price,
          data_symbol: initial.data_symbol,
        }
      : DEFAULTS
  );
  const [busy, setBusy] = useState(false);

  function set<K extends keyof PositionInput>(key: K, value: PositionInput[K]) {
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
        <Field label="Ticker">
          <input required className={inputClass} value={form.ticker} onChange={(e) => set("ticker", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Nom">
          <input required className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Classe d'actif">
          <select className={inputClass} value={form.asset_class} onChange={(e) => set("asset_class", e.target.value)}>
            <option value="equity">Action</option>
            <option value="etf">ETF</option>
            <option value="bond">Obligation</option>
            <option value="crypto">Crypto</option>
            <option value="fx">FX</option>
            <option value="future">Future</option>
            <option value="option">Option</option>
            <option value="cash">Cash</option>
          </select>
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
        <Field label="Secteur">
          <input className={inputClass} value={form.sector} onChange={(e) => set("sector", e.target.value)} />
        </Field>
        <Field label="Région">
          <input className={inputClass} value={form.region} onChange={(e) => set("region", e.target.value)} />
        </Field>
        <Field label="Quantité">
          <input type="number" step="any" className={inputClass} value={form.quantity} onChange={(e) => set("quantity", Number(e.target.value))} />
        </Field>
        <Field label="Prix moyen">
          <input type="number" step="any" className={inputClass} value={form.avg_cost} onChange={(e) => set("avg_cost", Number(e.target.value))} />
        </Field>
        <Field label="Dernier prix">
          <input type="number" step="any" className={inputClass} value={form.last_price} onChange={(e) => set("last_price", Number(e.target.value))} />
        </Field>
        <Field label="Symbole Yahoo (cotation)">
          <input
            className={inputClass}
            placeholder="ex: RIO.L, CMM.AX, 2222.SR"
            value={form.data_symbol ?? ""}
            onChange={(e) => set("data_symbol", e.target.value.trim())}
          />
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Ajouter la position"} />
    </form>
  );
}
