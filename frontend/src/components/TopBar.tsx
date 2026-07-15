import { CurrencySwitcher } from "./CurrencySwitcher";

export function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[var(--surface-1)] px-4">
      <div className="text-xs text-[var(--text-muted)]">
        Données de démonstration &middot; 15 juillet 2026
      </div>
      <div className="flex items-center gap-3">
        <CurrencySwitcher />
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--series-1)]/20 text-xs font-semibold text-[var(--series-1)]">
          HB
        </div>
      </div>
    </header>
  );
}
