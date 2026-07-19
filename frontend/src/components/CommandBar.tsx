import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { ClientSummary, SecuritySearchQuote } from "../api/types";
import { useAuth } from "../context/AuthContext";
import { useCurrency } from "../context/CurrencyContext";

interface Entry {
  key: string;
  group: "Pages" | "Clients" | "Titres";
  label: string;
  sub: string;
  to: string;
}

const PAGES: { to: string; label: string; adminOnly?: boolean }[] = [
  { to: "/", label: "Dashboard" },
  { to: "/clients", label: "Clients" },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/financier", label: "Financier" },
  { to: "/compliance", label: "Compliance" },
  { to: "/mandates", label: "Mandats" },
  { to: "/crm", label: "CRM" },
  { to: "/market", label: "Watchlist & News" },
  { to: "/earnings", label: "Earnings" },
  { to: "/allocation", label: "Allocation de capital" },
  { to: "/data", label: "Données & Synchro" },
  { to: "/reference", label: "Référence" },
  { to: "/users", label: "Users" },
  { to: "/audit", label: "Journal d'audit", adminOnly: true },
];

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [tickers, setTickers] = useState<SecuritySearchQuote[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currency } = useCurrency();

  // Global shortcut: Ctrl+K / Cmd+K toggles, Escape closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("commandbar:open", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("commandbar:open", onOpen);
    };
  }, []);

  // Reset + focus + load clients once per opening
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setTickers([]);
    setActive(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    api
      .clients(currency)
      .then(setClients)
      .catch(() => setClients([]));
  }, [open, currency]);

  // Debounced Yahoo ticker search
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setTickers([]);
      return;
    }
    const id = setTimeout(() => {
      api
        .securitiesSearch(q)
        .then((r) => setTickers(r.quotes))
        .catch(() => setTickers([]));
    }, 250);
    return () => clearTimeout(id);
  }, [open, query]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const out: Entry[] = [];
    for (const p of PAGES) {
      if (p.adminOnly && user?.role !== "admin") continue;
      if (q && !p.label.toLowerCase().includes(q)) continue;
      out.push({ key: `page-${p.to}`, group: "Pages", label: p.label, sub: p.to, to: p.to });
    }
    for (const c of clients) {
      if (!q || !c.name.toLowerCase().includes(q)) continue; // clients only appear once the user starts typing
      out.push({
        key: `client-${c.id}`,
        group: "Clients",
        label: c.name,
        sub: `${c.client_type} · ${c.base_currency}`,
        to: `/clients/${c.id}`,
      });
    }
    for (const t of tickers) {
      out.push({
        key: `ticker-${t.symbol}`,
        group: "Titres",
        label: `${t.symbol} — ${t.name}`,
        sub: [t.exchange, t.sector].filter(Boolean).join(" · "),
        to: `/security/${encodeURIComponent(t.symbol)}`,
      });
    }
    return out.slice(0, 20);
  }, [query, clients, tickers, user]);

  useEffect(() => setActive(0), [entries.length, query]);

  const go = useCallback(
    (entry: Entry) => {
      setOpen(false);
      navigate(entry.to);
    },
    [navigate]
  );

  function onInputKey(e: ReactKeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && entries[active]) {
      e.preventDefault();
      go(entries[active]);
    }
  }

  // Keep the active row visible while arrowing through
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-idx="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 pt-24"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl overflow-hidden rounded-lg border border-white/15 bg-[var(--surface-1)] shadow-2xl">
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <span className="text-[var(--text-muted)]">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Rechercher un ticker (AAPL, MC.PA…), un client, une page…"
            className="w-full bg-transparent py-3 text-sm focus:outline-none"
          />
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">Esc</kbd>
        </div>
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {entries.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-[var(--text-muted)]">
              {query.trim().length >= 2 ? "Aucun résultat." : "Tapez pour rechercher marchés, clients et pages."}
            </div>
          )}
          {entries.map((entry, idx) => {
            const showHeader = entry.group !== lastGroup;
            lastGroup = entry.group;
            return (
              <div key={entry.key}>
                {showHeader && (
                  <div className="px-4 pb-1 pt-2 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    {entry.group}
                  </div>
                )}
                <button
                  data-idx={idx}
                  onClick={() => go(entry)}
                  onMouseMove={() => setActive(idx)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm ${
                    idx === active ? "bg-[var(--series-1)]/15 text-[var(--series-1)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  <span className="truncate">{entry.label}</span>
                  <span className="ml-3 shrink-0 text-xs text-[var(--text-muted)]">{entry.sub}</span>
                </button>
              </div>
            );
          })}
        </div>
        <div className="border-t border-white/10 px-4 py-1.5 text-[10px] text-[var(--text-muted)]">
          ↑↓ naviguer · Entrée ouvrir · Ctrl+K fermer
        </div>
      </div>
    </div>
  );
}
