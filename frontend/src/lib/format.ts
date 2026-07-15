const CURRENCY_LOCALE: Record<string, string> = {
  USD: "en-US",
  EUR: "fr-FR",
  CHF: "de-CH",
  HKD: "en-HK",
  JPY: "ja-JP",
  GBP: "en-GB",
  AED: "en-AE",
};

export function formatMoney(amount: number, ccy: string, opts?: { compact?: boolean }): string {
  const locale = CURRENCY_LOCALE[ccy] ?? "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: ccy,
    maximumFractionDigits: opts?.compact ? 1 : 0,
    notation: opts?.compact ? "compact" : "standard",
  }).format(amount);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPct(value: number, decimals = 1): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
