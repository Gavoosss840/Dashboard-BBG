import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { BreakdownBars } from "../components/charts/BreakdownBars";
import { PnlValue } from "../components/ui/PnlValue";
import { formatMoney } from "../lib/format";

export function PortfolioPage() {
  const { currency } = useCurrency();
  const { data, loading, error } = useApi(() => api.globalPortfolio(currency), [currency]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Portfolio Composition" subtitle="Vue globale consolidée, tous clients et poches confondus" />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Valeur de marché totale" value={formatMoney(data.total_market_value, currency, { compact: true })} />
        <StatTile
          label="P&L latent total"
          value={<PnlValue amount={data.total_unrealized_pnl} ccy={currency} compact />}
          tone={data.total_unrealized_pnl >= 0 ? "good" : "critical"}
        />
        <StatTile label="Nombre de lignes" value={data.holdings.length} />
        <StatTile label="Nombre de clients" value={Object.keys(data.by_client).length} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Par classe d'actifs">
          <BreakdownBars data={data.by_asset_class} ccy={currency} />
        </Card>
        <Card title="Par secteur">
          <BreakdownBars data={data.by_sector} ccy={currency} />
        </Card>
        <Card title="Par région">
          <BreakdownBars data={data.by_region} ccy={currency} />
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Par devise native">
          <BreakdownBars data={data.by_currency} ccy={currency} />
        </Card>
        <Card title="Par poche de stratégie">
          <BreakdownBars data={data.by_strategy_bucket} ccy={currency} />
        </Card>
        <Card title="Par client">
          <BreakdownBars data={data.by_client} ccy={currency} maxItems={6} />
        </Card>
      </div>

      <Card title="Positions agrégées (toutes lignes, tous clients)" className="mt-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
              <th className="pb-2">Ticker</th>
              <th className="pb-2">Nom</th>
              <th className="pb-2">Classe</th>
              <th className="pb-2 text-right">Valeur marché</th>
              <th className="pb-2 text-right">Poids</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => (
              <tr key={h.ticker} className="border-t border-white/5">
                <td className="py-2 font-medium">{h.ticker}</td>
                <td className="py-2 text-[var(--text-secondary)]">{h.name}</td>
                <td className="py-2 capitalize text-[var(--text-secondary)]">{h.asset_class}</td>
                <td className="tabular py-2 text-right">{formatMoney(h.market_value, currency, { compact: true })}</td>
                <td className="tabular py-2 text-right">{h.weight_pct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
