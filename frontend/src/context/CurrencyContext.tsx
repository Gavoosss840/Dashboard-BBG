import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export const SUPPORTED_CURRENCIES = ["USD", "EUR", "CHF", "HKD", "JPY", "GBP", "AED"] as const;
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const STORAGE_KEY = "boulet-capital-currency";

interface CurrencyContextValue {
  currency: Currency;
  setCurrency: (ccy: Currency) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | undefined>(undefined);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [currency, setCurrencyState] = useState<Currency>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored as Currency) ?? "EUR";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, currency);
  }, [currency]);

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency: setCurrencyState }}>
      {children}
    </CurrencyContext.Provider>
  );
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency must be used within CurrencyProvider");
  return ctx;
}
