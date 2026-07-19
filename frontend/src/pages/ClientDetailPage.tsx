import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
import { Modal } from "../components/ui/Modal";
import { DeleteButton } from "../components/ui/form";
import { ClientForm } from "../components/forms/ClientForm";
import { MandateForm } from "../components/forms/MandateForm";
import { PortfolioForm } from "../components/forms/PortfolioForm";
import { PositionForm } from "../components/forms/PositionForm";
import { CashFlowForm } from "../components/forms/CashFlowForm";
import { formatDate, formatMoney, formatNumber, formatPct } from "../lib/format";
import type {
  CashFlowInput,
  ClientInput,
  Mandate,
  MandateInput,
  Portfolio,
  PortfolioInput,
  Position,
  PositionInput,
} from "../api/types";

type ModalState =
  | { type: "editClient" }
  | { type: "newMandate" }
  | { type: "editMandate"; mandate: Mandate }
  | { type: "newPortfolio" }
  | { type: "editPortfolio"; portfolio: Portfolio }
  | { type: "newPosition"; portfolioId: number }
  | { type: "editPosition"; position: Position }
  | { type: "newCashFlow" }
  | null;

export function ClientDetailPage() {
  const { id } = useParams();
  const { currency } = useCurrency();
  const clientId = Number(id);
  const { data, loading, error, reload } = useApi(() => api.client(clientId, currency), [clientId, currency]);
  const users = useApi(() => api.users(), []);
  const [modal, setModal] = useState<ModalState>(null);
  const navigate = useNavigate();

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

  async function handleUpdateClient(payload: ClientInput) {
    await api.updateClient(clientId, payload, currency);
    setModal(null);
    reload();
  }

  async function handleDeleteClient() {
    await api.deleteClient(clientId);
    navigate("/clients");
  }

  async function handleMandateSubmit(payload: MandateInput) {
    if (modal?.type === "editMandate") {
      await api.updateMandate(modal.mandate.id, payload);
    } else {
      await api.createMandate(payload);
    }
    setModal(null);
    reload();
  }

  async function handleDeleteMandate(id: number) {
    await api.deleteMandate(id);
    reload();
  }

  async function handlePortfolioSubmit(payload: PortfolioInput) {
    if (modal?.type === "editPortfolio") {
      await api.updatePortfolio(modal.portfolio.id, payload);
    } else {
      await api.createPortfolio(payload);
    }
    setModal(null);
    reload();
  }

  async function handleDeletePortfolio(id: number) {
    await api.deletePortfolio(id);
    reload();
  }

  async function handlePositionSubmit(payload: PositionInput) {
    if (modal?.type === "editPosition") {
      await api.updatePosition(modal.position.id, payload);
    } else if (modal?.type === "newPosition") {
      await api.createPosition(modal.portfolioId, payload);
    }
    setModal(null);
    reload();
  }

  async function handleDeletePosition(id: number) {
    await api.deletePosition(id);
    reload();
  }

  async function handleCashFlowSubmit(payload: CashFlowInput) {
    await api.createCashFlow(clientId, payload);
    setModal(null);
    reload();
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title={data.name}
        subtitle={[`Client #${data.id}`, data.country, `Sous mandat depuis le ${formatDate(data.entry_date)}`]
          .filter(Boolean)
          .join(" · ")}
        action={
          <div className="flex items-center gap-2">
            <Link to="/clients" className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              ← Retour
            </Link>
            <button
              onClick={() => setModal({ type: "newCashFlow" })}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
            >
              + Dépôt / Retrait
            </button>
            <button
              onClick={() => setModal({ type: "editClient" })}
              className="rounded border border-white/10 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
            >
              Modifier
            </button>
            <DeleteButton onConfirm={handleDeleteClient} label="Supprimer le client" />
          </div>
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

      {(data.twr_ytd !== null || data.twr_since_inception !== null) && (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatTile
            label="TWR YTD"
            value={data.twr_ytd !== null ? formatPct(data.twr_ytd * 100) : "—"}
            sub="Performance pondérée dans le temps"
            tone={data.twr_ytd !== null ? (data.twr_ytd >= 0 ? "good" : "critical") : "neutral"}
          />
          <StatTile
            label="TWR Since Inception"
            value={data.twr_since_inception !== null ? formatPct(data.twr_since_inception * 100) : "—"}
            sub="Insensible aux dépôts/retraits"
            tone={data.twr_since_inception !== null ? (data.twr_since_inception >= 0 ? "good" : "critical") : "neutral"}
          />
        </div>
      )}

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
        <Card
          title="Mandats de gestion"
          className="lg:col-span-2"
          action={
            <button
              onClick={() => setModal({ type: "newMandate" })}
              className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
            >
              + Ajouter un mandat
            </button>
          }
        >
          {data.mandates.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">Aucun mandat.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
                  <th className="pb-2">Type</th>
                  <th className="pb-2">Signature</th>
                  <th className="pb-2">Entrée</th>
                  <th className="pb-2">Gestion</th>
                  <th className="pb-2">Sortie</th>
                  <th className="pb-2">Perf. fee</th>
                  <th className="pb-2">Benchmark</th>
                  <th className="pb-2">Statut</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {data.mandates.map((m) => (
                  <tr key={m.id} className="border-t border-white/5">
                    <td className="py-2 capitalize">{m.mandate_type}</td>
                    <td className="py-2 text-[var(--text-secondary)]">{formatDate(m.signing_date)}</td>
                    <td className="tabular py-2">{m.entry_fee_pct > 0 ? `${m.entry_fee_pct}%` : "—"}</td>
                    <td className="tabular py-2">{m.mgmt_fee_pct}%</td>
                    <td className="tabular py-2">{m.exit_fee_pct > 0 ? `${m.exit_fee_pct}%` : "—"}</td>
                    <td className="tabular py-2">
                      {m.perf_fee_pct}% {m.hurdle_rate_pct > 0 && `(hurdle ${m.hurdle_rate_pct}%)`}
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{m.benchmark}</td>
                    <td className="py-2">
                      <Badge label={m.status} />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setModal({ type: "editMandate", mandate: m })}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                        >
                          modifier
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Supprimer ce mandat ?")) handleDeleteMandate(m.id);
                          }}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                        >
                          supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Portefeuilles"
        action={
          <button
            onClick={() => setModal({ type: "newPortfolio" })}
            className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
          >
            + Ajouter un portefeuille
          </button>
        }
      >
        {data.portfolios.length === 0 && <div className="text-sm text-[var(--text-muted)]">Aucun portefeuille.</div>}
      </Card>

      {data.portfolios.map((p) => (
        <Card
          key={p.id}
          title={`Positions — Portefeuille ${p.ptf_id} (${p.strategy_bucket.replace("_", " ")})`}
          className="mt-4"
          action={
            <div className="flex gap-2">
              <button
                onClick={() => setModal({ type: "newPosition", portfolioId: p.id })}
                className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
              >
                + Position
              </button>
              <button
                onClick={() => setModal({ type: "editPortfolio", portfolio: p })}
                className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--text-secondary)] hover:border-[var(--series-1)] hover:text-[var(--series-1)]"
              >
                Modifier
              </button>
              <button
                onClick={() => {
                  if (window.confirm("Supprimer ce portefeuille et toutes ses positions ?")) handleDeletePortfolio(p.id);
                }}
                className="rounded border border-white/10 px-2 py-1 text-xs text-[var(--status-critical)] hover:border-[var(--status-critical)]"
              >
                Supprimer
              </button>
            </div>
          }
        >
          {p.cash_balances.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[var(--text-secondary)]">
              <span className="text-[var(--text-muted)]">Cash :</span>
              {p.cash_balances.map((cb) => (
                <span key={cb.currency} className="rounded bg-white/5 px-1.5 py-0.5 tabular">
                  {formatMoney(cb.amount, cb.currency)}
                </span>
              ))}
              <span className="text-[var(--text-muted)]">
                (total {formatMoney(p.cash_total, currency, { compact: true })})
              </span>
            </div>
          )}
          {p.positions.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)]">Aucune position.</div>
          ) : (
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
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {p.positions.map((pos) => (
                  <tr key={pos.id} className="border-t border-white/5">
                    <td className="py-2 font-medium">
                      <Link
                        to={`/security/${encodeURIComponent(pos.ticker)}`}
                        className="hover:text-[var(--series-1)] hover:underline"
                      >
                        {pos.ticker}
                      </Link>
                    </td>
                    <td className="py-2 text-[var(--text-secondary)]">{pos.name}</td>
                    <td className="py-2 capitalize text-[var(--text-secondary)]">{pos.asset_class}</td>
                    <td className="tabular py-2 text-right">{formatNumber(pos.quantity, pos.asset_class === "crypto" ? 4 : 2)}</td>
                    <td className="tabular py-2 text-right">{formatMoney(pos.avg_cost, pos.currency)}</td>
                    <td className="tabular py-2 text-right">{formatMoney(pos.last_price, pos.currency)}</td>
                    <td className="tabular py-2 text-right">{formatMoney(pos.market_value, currency, { compact: true })}</td>
                    <td className="py-2 text-right">
                      <PnlValue amount={pos.unrealized_pnl} ccy={currency} compact />
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setModal({ type: "editPosition", position: pos })}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
                        >
                          modifier
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm("Supprimer cette position ?")) handleDeletePosition(pos.id);
                          }}
                          className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                        >
                          supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <PortfolioTrades portfolioId={p.id} />
        </Card>
      ))}

      <Modal open={modal?.type === "editClient"} onClose={() => setModal(null)} title="Modifier le client" wide>
        <ClientForm initial={data} users={users.data ?? []} onSubmit={handleUpdateClient} onCancel={() => setModal(null)} />
      </Modal>

      <Modal
        open={modal?.type === "newMandate" || modal?.type === "editMandate"}
        onClose={() => setModal(null)}
        title={modal?.type === "editMandate" ? "Modifier le mandat" : "Nouveau mandat"}
        wide
      >
        <MandateForm
          clientId={clientId}
          initial={modal?.type === "editMandate" ? modal.mandate : undefined}
          onSubmit={handleMandateSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <Modal
        open={modal?.type === "newPortfolio" || modal?.type === "editPortfolio"}
        onClose={() => setModal(null)}
        title={modal?.type === "editPortfolio" ? "Modifier le portefeuille" : "Nouveau portefeuille"}
      >
        <PortfolioForm
          clientId={clientId}
          initial={modal?.type === "editPortfolio" ? modal.portfolio : undefined}
          onSubmit={handlePortfolioSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <Modal
        open={modal?.type === "newPosition" || modal?.type === "editPosition"}
        onClose={() => setModal(null)}
        title={modal?.type === "editPosition" ? "Modifier la position" : "Nouvelle position"}
      >
        <PositionForm
          initial={modal?.type === "editPosition" ? modal.position : undefined}
          onSubmit={handlePositionSubmit}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <Modal open={modal?.type === "newCashFlow"} onClose={() => setModal(null)} title="Dépôt / Retrait">
        <CashFlowForm defaultCurrency={data.base_currency} onSubmit={handleCashFlowSubmit} onCancel={() => setModal(null)} />
      </Modal>
    </div>
  );
}

function PortfolioTrades({ portfolioId }: { portfolioId: number }) {
  const { data } = useApi(() => api.portfolioTrades(portfolioId), [portfolioId]);
  const [open, setOpen] = useState(false);
  if (!data || data.length === 0) return null;
  return (
    <div className="mt-4 border-t border-white/5 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)]"
      >
        {open ? "▾" : "▸"} Blotter — {data.length} trade{data.length > 1 ? "s" : ""}
      </button>
      {open && (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-[var(--text-muted)]">
              <th className="pb-2">Date</th>
              <th className="pb-2">Sens</th>
              <th className="pb-2">Ticker</th>
              <th className="pb-2 text-right">Qté</th>
              <th className="pb-2 text-right">Prix</th>
              <th className="pb-2 text-right">Commission</th>
              <th className="pb-2 text-right">P&L réalisé</th>
              <th className="pb-2">Source</th>
            </tr>
          </thead>
          <tbody>
            {data.map((t) => (
              <tr key={t.id} className="border-t border-white/5">
                <td className="py-1.5 text-[var(--text-secondary)]">{formatDate(t.trade_date)}</td>
                <td className="py-1.5">
                  <span style={{ color: t.side === "BUY" ? "var(--status-good)" : "var(--status-critical)" }}>
                    {t.side === "BUY" ? "Achat" : "Vente"}
                  </span>
                </td>
                <td className="py-1.5 font-medium">
                  <Link
                    to={`/security/${encodeURIComponent(t.ticker)}`}
                    className="hover:text-[var(--series-1)] hover:underline"
                  >
                    {t.ticker}
                  </Link>
                </td>
                <td className="tabular py-1.5 text-right">{formatNumber(t.quantity, 2)}</td>
                <td className="tabular py-1.5 text-right">{formatMoney(t.price, t.currency)}</td>
                <td className="tabular py-1.5 text-right text-[var(--text-muted)]">{formatMoney(t.commission, t.currency)}</td>
                <td className="py-1.5 text-right">
                  <PnlValue amount={t.realized_pnl} ccy={t.currency} />
                </td>
                <td className="py-1.5 text-xs uppercase text-[var(--text-muted)]">{t.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
