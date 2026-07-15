import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Badge } from "../components/ui/Badge";
import { PnlValue } from "../components/ui/PnlValue";
import { Modal } from "../components/ui/Modal";
import { ClientForm } from "../components/forms/ClientForm";
import { formatMoney } from "../lib/format";
import type { ClientInput } from "../api/types";

export function ClientsPage() {
  const { currency } = useCurrency();
  const { data, loading, error, reload } = useApi(() => api.clients(currency), [currency]);
  const users = useApi(() => api.users(), []);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  async function handleCreate(payload: ClientInput) {
    const client = await api.createClient(payload, currency);
    setShowCreate(false);
    reload();
    navigate(`/clients/${client.id}`);
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  const filtered = data.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle={`${data.length} clients sous mandat`}
        action={
          <div className="flex gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un client…"
              className="rounded border border-white/10 bg-[var(--surface-2)] px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
            />
            <button
              onClick={() => setShowCreate(true)}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
            >
              + Nouveau client
            </button>
          </div>
        }
      />
      {data.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            Aucun client pour l'instant. Clique sur "+ Nouveau client" pour commencer.
          </div>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">ID</th>
                <th className="pb-2">Nom</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Entrée sous mandat</th>
                <th className="pb-2">Statut</th>
                <th className="pb-2 text-right">Dépôts nets</th>
                <th className="pb-2 text-right">NAV actuelle</th>
                <th className="pb-2 text-right">P&L YTD</th>
                <th className="pb-2 text-right">P&L since inception</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                  <td className="py-2.5 text-[var(--text-muted)]">#{c.id}</td>
                  <td className="py-2.5">
                    <Link to={`/clients/${c.id}`} className="font-medium hover:text-[var(--series-1)]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2.5 capitalize text-[var(--text-secondary)]">{c.client_type}</td>
                  <td className="py-2.5 text-[var(--text-secondary)]">{c.entry_date}</td>
                  <td className="py-2.5">
                    <Badge label={c.status} />
                  </td>
                  <td className="tabular py-2.5 text-right">{formatMoney(c.net_deposits, c.base_currency, { compact: true })}</td>
                  <td className="tabular py-2.5 text-right">{formatMoney(c.current_nav, currency, { compact: true })}</td>
                  <td className="py-2.5 text-right">
                    <PnlValue amount={c.pnl_ytd} ccy={currency} compact />
                  </td>
                  <td className="py-2.5 text-right">
                    <PnlValue amount={c.pnl_since_inception} ccy={currency} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Nouveau client" wide>
        <ClientForm users={users.data ?? []} onSubmit={handleCreate} onCancel={() => setShowCreate(false)} />
      </Modal>
    </div>
  );
}
