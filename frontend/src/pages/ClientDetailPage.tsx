import { useMemo, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { Badge } from "../components/ui/Badge";
import { PnlValue } from "../components/ui/PnlValue";
import { NavChart } from "../components/charts/NavChart";
import { BreakdownBars } from "../components/charts/BreakdownBars";
import { formatDate, formatMoney, formatNumber } from "../lib/format";

export function ClientDetailPage() {
  const { id } = useParams();
  const { currency } = useCurrency();
  const clientId = Number(id);
  const { data, loading, error } = useApi(() => api.client(clientId, currency), [clientId, currency]);

  const combinedNav = useMemo(() => {
    if (!data) return [];
    const byDate = new Map<string, number>();
    for (const p of data.portfolios) {
      for (const point of p.nav_history) {
        byDate.set(point.date, (byDate.get(point.date) ?? 0) + point.nav);
      }
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, nav]) => ({ date, nav }));
  }, [data]);

  const assetClassBreakdown = useMemo(() => {
    if (!data) return {};
    const out: Record<string, number> = {};
    for (const p of data.portfolios) {
      for (const pos of p.positions) {
        out[pos.asset_class] = (out[pos.asset_class] ?? 0) + pos.market_value;
      }
    }
    return out;
  }, [data]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={`Client #${data.id} · ${data.country} · Sous mandat depuis le ${formatDate(data.entry_date)}`}
        action={
          <Link to="/clients" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            ← Retour
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="NAV actuelle" value={formatMoney(data.current_nav, currency, { compact: true })} />
        <StatTile label="Dépôts nets" value={formatMoney(data.net_deposits, currency, { compact: true })} />
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
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Évolution de la NAV" className="lg:col-span-2">
          <NavChart data={combinedNav} ccy={currency} />
        </Card>
        <Card title="Fiche client">
          <dl className="space-y-2 text-sm">
            <Row label="Statut" value={<Badge label={data.status} />} />
            <Row label="Type" value={<span className="capitalize">{data.client_type}</span>} />
            <Row label="Devise de référence" value={data.base_currency} />
            <Row label="Profil de risque" value={<span className="capitalize">{data.risk_profile}</span>} />
            <Row label="KYC" value={<Badge label={data.kyc_status} />} />
            <Row label="Gérant relation" value={data.relationship_manager?.name ?? "—"} />
            <Row label="Email" value={data.email} />
            <Row label="Total dépôts" value={formatMoney(data.total_deposits, data.base_currency, { compact: true })} />
            <Row label="Total retraits" value={formatMoney(data.total_withdrawals, data.base_currency, { compact: true })} />
          </dl>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Composition du portefeuille">
          <BreakdownBars data={assetClassBreakdown} ccy={currency} />
        </Card>
        <Card title="Mandats de gestion" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Type</th>
                <th className="pb-2">Signature</th>
                <th className="pb-2">Frais gestion</th>
                <th className="pb-2">Perf. fee</th>
                <th className="pb-2">Benchmark</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.mandates.map((m) => (
                <tr key={m.id} className="border-t border-white/5">
                  <td className="py-2 capitalize">{m.mandate_type}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{formatDate(m.signing_date)}</td>
                  <td className="tabular py-2">{m.mgmt_fee_pct}%</td>
                  <td className="tabular py-2">
                    {m.perf_fee_pct}% {m.hurdle_rate_pct > 0 && `(hurdle ${m.hurdle_rate_pct}%)`}
                  </td>
                  <td className="py-2 text-[var(--text-secondary)]">{m.benchmark}</td>
                  <td className="py-2">
                    <Badge label={m.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {data.portfolios.map((p) => (
        <Card key={p.id} title={`Positions — Portefeuille ${p.ptf_id} (${p.strategy_bucket.replace("_", " ")})`} className="mt-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                <th className="pb-2">Ticker</th>
                <th className="pb-2">Nom</th>
                <th className="pb-2">Classe</th>
                <th className="pb-2 text-right">Qté</th>
                <th className="pb-2 text-right">Prix moyen</th>
                <th className="pb-2 text-right">Dernier prix</th>
                <th className="pb-2 text-right">Valeur marché</th>
                <th className="pb-2 text-right">P&L latent</th>
              </tr>
            </thead>
            <tbody>
              {p.positions.map((pos) => (
                <tr key={pos.id} className="border-t border-white/5">
                  <td className="py-2 font-medium">{pos.ticker}</td>
                  <td className="py-2 text-[var(--text-secondary)]">{pos.name}</td>
                  <td className="py-2 capitalize text-[var(--text-secondary)]">{pos.asset_class}</td>
                  <td className="tabular py-2 text-right">{formatNumber(pos.quantity, pos.asset_class === "crypto" ? 4 : 2)}</td>
                  <td className="tabular py-2 text-right">{formatMoney(pos.avg_cost, pos.currency)}</td>
                  <td className="tabular py-2 text-right">{formatMoney(pos.last_price, pos.currency)}</td>
                  <td className="tabular py-2 text-right">{formatMoney(pos.market_value, currency, { compact: true })}</td>
                  <td className="py-2 text-right">
                    <PnlValue amount={pos.unrealized_pnl} ccy={currency} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
