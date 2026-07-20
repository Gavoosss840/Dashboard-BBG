import { useState } from "react";
import { CurrencySwitcher } from "./CurrencySwitcher";
import { useAuth } from "../context/AuthContext";

export function TopBar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[var(--surface-1)] px-4">
      <div className="text-xs text-[var(--text-muted)]">
        B. Horizon Capital &middot;{" "}
        {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.dispatchEvent(new Event("commandbar:open"))}
          className="flex items-center gap-2 rounded border border-white/10 bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-muted)] hover:border-white/20"
        >
          ⌕ Rechercher un titre, un client…
          <kbd className="rounded border border-white/15 px-1 py-0.5 text-[10px]">Ctrl K</kbd>
        </button>
        <CurrencySwitcher />
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--series-1)]/20 text-xs font-semibold text-[var(--series-1)]"
          >
            {user?.avatar_initials || "?"}
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-10 z-50 w-48 rounded border border-white/10 bg-[var(--surface-2)] py-1 shadow-lg"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <div className="border-b border-white/10 px-3 py-2 text-xs text-[var(--text-secondary)]">
                <div className="font-medium text-[var(--text-primary)]">{user?.name}</div>
                <div className="truncate text-[var(--text-muted)]">{user?.email}</div>
              </div>
              <button
                onClick={logout}
                className="w-full px-3 py-2 text-left text-xs text-[var(--status-critical)] hover:bg-white/5"
              >
                Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
