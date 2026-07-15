import { SUPPORTED_CURRENCIES, useCurrency } from "../context/CurrencyContext";

export function CurrencySwitcher() {
  const { currency, setCurrency } = useCurrency();
  return (
    <select
      value={currency}
      onChange={(e) => setCurrency(e.target.value as typeof currency)}
      className="rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
    >
      {SUPPORTED_CURRENCIES.map((ccy) => (
        <option key={ccy} value={ccy}>
          {ccy}
        </option>
      ))}
    </select>
  );
}
