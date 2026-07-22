import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SECTIONS: { label: string; items: { to: string; label: string; adminOnly?: boolean }[] }[] = [
  {
    label: "Vue d'ensemble",
    items: [{ to: "/", label: "Dashboard" }],
  },
  {
    label: "Clients & Portefeuille",
    items: [
      { to: "/clients", label: "Clients" },
      { to: "/portfolio", label: "Portfolio" },
      { to: "/reports", label: "Report client" },
    ],
  },
  {
    label: "Gestion",
    items: [
      { to: "/financier", label: "Financier" },
      { to: "/compliance", label: "Compliance" },
      { to: "/mandates", label: "Mandats" },
      { to: "/crm", label: "CRM" },
    ],
  },
  {
    label: "Marché",
    items: [
      { to: "/markets", label: "Marchés" },
      { to: "/research", label: "Recherche Equity" },
      { to: "/market", label: "Watchlist & News" },
      { to: "/earnings", label: "Earnings" },
    ],
  },
  {
    label: "Outils",
    items: [
      { to: "/allocation", label: "Allocation de capital" },
      { to: "/data", label: "Données & Synchro" },
      { to: "/reference", label: "Référence" },
    ],
  },
  {
    label: "Organisation",
    items: [
      { to: "/users", label: "Users" },
      { to: "/audit", label: "Journal d'audit", adminOnly: true },
    ],
  },
];

export function Sidebar() {
  const { user } = useAuth();
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-white/10 bg-[var(--surface-1)]">
      <div className="border-b border-white/10 px-4 py-4">
        <div className="text-sm font-bold tracking-wide">B. HORIZON CAPITAL</div>
        <div className="text-xs text-[var(--text-muted)]">Internal Terminal</div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-2 pb-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              {section.label}
            </div>
            {section.items
              .filter((item) => !item.adminOnly || user?.role === "admin")
              .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `block rounded px-2 py-1.5 text-sm ${
                    isActive
                      ? "bg-[var(--series-1)]/20 text-[var(--series-1)]"
                      : "text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)]"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
