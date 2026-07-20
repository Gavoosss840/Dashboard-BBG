import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { NavChart } from "../components/charts/NavChart";
import { BreakdownBars } from "../components/charts/BreakdownBars";
import { PnlValue } from "../components/ui/PnlValue";
import { formatMoney } from "../lib/format";

export function DashboardPage() {
  const { currency } = useCurrency();
  const { data, loading, error } = useApi(() => api.dashboard(currency), [currency]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Dashboard Overview" subtitle={`B. Horizon Capital · au ${data.as_of}`} />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="AUM Total" value={formatMoney(data.total_aum, currency, { compact: true })} sub={`${data.num_clients} clients actifs`} />
        <StatTile
          label="P&L YTD"
          value={<PnlValue amount={data.pnl_ytd} ccy={currency} compact />}
          tone={data.pnl_ytd >= 0 ? "good" : "critical"}
        />
        <StatTile
          label="P&L Since Inception"
          value={<PnlValue amount={data.pnl_since_inception} ccy={currency} compact />}
          tone={data.pnl_since_inception >= 0 ? "good" : "critical"}
        />
        <StatTile label="Mandats actifs" value={data.num_active_mandates} sub="Discrétionnaires" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Fees en attente" value={formatMoney(data.pending_fees, currency, { compact: true })} />
        <StatTile label="Résultats à venir" value={data.upcoming_earnings} sub="30 prochains jours" />
        <StatTile label="Leads CRM ouverts" value={data.open_crm_leads} />
        <StatTile label="Devise d'affichage" value={currency} sub="Modifiable en haut à droite" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Évolution de la NAV globale" className="lg:col-span-2">
          <NavChart data={data.nav_history} ccy={currency} />
        </Card>
        <Card title="AUM par poche de stratégie">
          <BreakdownBars data={data.aum_by_bucket} ccy={currency} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="AUM par classe d'actifs">
          <BreakdownBars data={data.aum_by_asset_class} ccy={currency} />
        </Card>
        <Card title="Top clients par NAV" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Client</th>
                <th className="pb-2">Entrée</th>
                <th className="pb-2 text-right">NAV</th>
                <th className="pb-2 text-right">P&L YTD</th>
              </tr>
            </thead>
            <tbody>
              {data.top_clients.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="py-2">
                    <Link to={`/clients/${c.id}`} className="hover:text-[var(--series-1)]">
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2 text-[var(--text-muted)]">{c.entry_date}</td>
                  <td className="tabular py-2 text-right">{formatMoney(c.current_nav, currency, { compact: true })}</td>
                  <td className="py-2 text-right">
                    <PnlValue amount={c.pnl_ytd} ccy={currency} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
