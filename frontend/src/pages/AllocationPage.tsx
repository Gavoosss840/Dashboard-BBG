import { api } from "../api/client";
import { useCurrency } from "../context/CurrencyContext";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { StatTile } from "../components/ui/StatTile";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatMoney, formatPct } from "../lib/format";

export function AllocationPage() {
  const { currency } = useCurrency();
  const { data, loading, error } = useApi(() => api.allocation(currency), [currency]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Répartition du capital — Risk Parity"
        subtitle={data.method}
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <StatTile label="AUM total alloué" value={formatMoney(data.total_aum, currency, { compact: true })} />
        {data.buckets.map((b) => (
          <StatTile
            key={b.id}
            label={`Vol réalisée — ${b.name}`}
            value={`${b.realized_vol_annualized.toFixed(1)}%`}
            sub={`Fenêtre ${b.lookback_days}j`}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data.buckets.map((b) => (
          <Card key={b.id} title={b.name}>
            <div className="space-y-3">
              <BarRow label="Poids actuel" pct={b.current_weight_pct} color={b.color} />
              <BarRow label="Poids cible (ERC)" pct={b.target_weight_pct} color={b.color} dashed />
              <div className="flex items-center justify-between pt-1 text-sm">
                <span className="text-[var(--text-muted)]">AUM</span>
                <span className="tabular">{formatMoney(b.aum, currency, { compact: true })}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Écart à rebalancer</span>
                <span
                  className="tabular font-medium"
                  style={{ color: Math.abs(b.rebalance_delta_pct) < 1 ? "var(--text-secondary)" : b.rebalance_delta_pct > 0 ? "var(--status-good)" : "var(--status-critical)" }}
                >
                  {formatPct(b.rebalance_delta_pct)}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card className="mt-4" title="Note méthodologique">
        <p className="text-sm text-[var(--text-secondary)]">
          Allocation en <strong>Equal Risk Contribution</strong> pure (sans contrainte min/max) : chaque poche contribue à parts
          égales au risque total. Pour deux poches, ce résultat est mathématiquement équivalent à une pondération inverse-vol
          (indépendamment de la corrélation entre les poches). La vol réalisée est calculée sur une fenêtre glissante de{" "}
          {data.buckets[0]?.lookback_days ?? 60} jours. Si vous ajoutez une 3ᵉ poche (ex: macro), le solveur ERC général prend le
          relais automatiquement.
        </p>
      </Card>
    </div>
  );
}

function BarRow({ label, pct, color, dashed }: { label: string; pct: number; color: string; dashed?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="tabular text-[var(--text-primary)]">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: color || "var(--series-1)",
            opacity: dashed ? 0.55 : 1,
          }}
        />
      </div>
    </div>
  );
}
