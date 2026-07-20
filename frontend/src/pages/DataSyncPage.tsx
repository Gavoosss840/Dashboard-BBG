import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDateTime } from "../lib/format";
import type { SyncLog } from "../api/types";

function SyncResult({ log }: { log: SyncLog | null }) {
  if (!log) return <div className="text-sm text-[var(--text-muted)]">Jamais exécuté.</div>;
  const color =
    log.status === "success" ? "var(--status-good)" : log.status === "error" ? "var(--status-critical)" : "var(--status-warning)";
  return (
    <div className="text-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "rgba(255,255,255,0.05)", color }}>
          {log.status === "success" ? "Succès" : log.status === "error" ? "Erreur" : "En cours"}
        </span>
        <span className="text-xs text-[var(--text-muted)]">{formatDateTime(log.started_at)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[var(--text-secondary)]">{log.message}</p>
    </div>
  );
}

export function DataSyncPage() {
  const { data, loading, error, reload } = useApi(() => api.syncStatus(), []);
  const [busy, setBusy] = useState<"ibkr" | "market" | "backup" | "earnings" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runIbkr() {
    setBusy("ibkr");
    setActionError(null);
    try {
      await api.triggerIbkrSync();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function runMarket() {
    setBusy("market");
    setActionError(null);
    try {
      await api.triggerMarketRefresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function runBackup() {
    setBusy("backup");
    setActionError(null);
    try {
      await api.triggerBackup();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      reload();
    }
  }

  async function runEarnings() {
    setBusy("earnings");
    setActionError(null);
    try {
      await api.triggerEarningsSync();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      reload();
    }
  }

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Données & Synchro"
        subtitle="Connexion Interactive Brokers (relevés officiels) et données de marché"
      />

      {actionError && <ErrorState message={actionError} />}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card
          title="Interactive Brokers — synchro quotidienne"
          action={
            <button
              onClick={runIbkr}
              disabled={busy !== null}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "ibkr" ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
          }
        >
          <div className="mb-3 flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: data.ibkr_configured ? "var(--status-good)" : "var(--status-critical)" }}
            />
            <span className="text-[var(--text-secondary)]">
              {data.ibkr_configured
                ? `${data.ibkr_connections} connexion(s) IBKR configurée(s) — la synchro tourne automatiquement au démarrage (si plus de 12h ont passé).`
                : "Non configuré : renseignez IBKR_FLEX_TOKEN et IBKR_FLEX_QUERY_ID dans docker-compose.yml (voir guide ci-dessous)."}
            </span>
          </div>
          <SyncResult log={data.last_ibkr_sync} />
        </Card>

        <Card
          title="Données de marché — prix & taux de change"
          action={
            <button
              onClick={runMarket}
              disabled={busy !== null}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "market" ? "Rafraîchissement…" : "Rafraîchir maintenant"}
            </button>
          }
        >
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Prix fin de journée (Yahoo Finance) pour la watchlist et les positions entre deux synchros IBKR, taux de change
            réels (BCE/marché) pour les 7 devises. Rafraîchi automatiquement au démarrage.
          </p>
          <SyncResult log={data.last_market_refresh} />
        </Card>

        <Card
          title="Earnings — calendrier de résultats"
          action={
            <button
              onClick={runEarnings}
              disabled={busy !== null}
              className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy === "earnings" ? "Synchronisation…" : "Synchroniser maintenant"}
            </button>
          }
        >
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Prochaine date de résultats (Yahoo Finance) pour chaque valeur de la watchlist — visible sur la page{" "}
            <strong>Earnings</strong>. Rafraîchi automatiquement toutes les 12h.
          </p>
          <SyncResult log={data.last_earnings_sync} />
        </Card>
      </div>

      <Card
        className="mt-4"
        title="Sauvegardes de la base de données"
        action={
          <button
            onClick={runBackup}
            disabled={busy !== null}
            className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy === "backup" ? "Sauvegarde…" : "Sauvegarder maintenant"}
          </button>
        }
      >
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          Sauvegarde automatique quotidienne de toute la base (clients, positions, transactions…) dans le dossier{" "}
          <code className="rounded bg-white/10 px-1">backups/</code> du projet sur ta machine — les 30 dernières sont
          conservées. Ce dossier survit même à un reset Docker complet ; pense à le synchroniser vers OneDrive/Drive pour
          avoir une copie hors machine.
        </p>
        <SyncResult log={data.last_backup} />
      </Card>

      <Card className="mt-4" title="Guide — connecter tes comptes IBKR (une seule fois)">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--text-secondary)]">
          <li>
            Connecte-toi à <strong>IBKR Account Management</strong> (interactivebrokers.com) →{" "}
            <strong>Performance & Reports → Flex Queries</strong> → crée une <strong>Activity Flex Query</strong>.
          </li>
          <li>
            Coche ces sections (toutes les colonnes) : <strong>Open Positions</strong>, <strong>Trades</strong>,{" "}
            <strong>Cash Transactions</strong>, <strong>Cash Report</strong>,{" "}
            <strong>Net Asset Value (NAV) in Base</strong>. Période : <strong>Last Business Day</strong> (pour la <em>toute première</em> synchro, mets plutôt{" "}
            <em>Last 365 Calendar Days</em> le temps d'un premier import, afin de rattraper l'historique de NAV, les
            trades et les dépôts de l'année — puis repasse sur <em>Last Business Day</em>). Format :{" "}
            <strong>XML</strong>. Note le <strong>Query ID</strong> affiché après création.
          </li>
          <li>
            Puis <strong>Settings → Account Settings → Flex Web Service</strong> → active-le et génère un{" "}
            <strong>token</strong>.
          </li>
          <li>
            Sur ta machine, ouvre <code className="rounded bg-white/10 px-1">docker-compose.yml</code> et renseigne :
            <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs">
              {`environment:
  - IBKR_FLEX_TOKEN=ton_token_ici
  - IBKR_FLEX_QUERY_ID=ton_query_id_ici`}
            </pre>
            ⚠ Le token reste sur ta machine — ne le partage jamais (ni par email, ni dans un chat).
          </li>
          <li className="rounded border border-[var(--series-1)]/25 bg-[var(--series-1)]/[0.05] p-3">
            <strong>Plusieurs logins IBKR (ex : un login par client) ?</strong> Ajoute une paire{" "}
            <strong>numérotée</strong> par login supplémentaire — la synchro les traite toutes et agrège les résultats :
            <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs">
              {`environment:
  - IBKR_FLEX_TOKEN_1=token_client_A
  - IBKR_FLEX_QUERY_ID_1=query_client_A
  - IBKR_FLEX_TOKEN_2=token_client_B
  - IBKR_FLEX_QUERY_ID_2=query_client_B`}
            </pre>
            Si tes comptes sont au contraire sous un <em>seul</em> login (compte advisor/master avec sous-comptes),
            une seule paire suffit — une Flex Query peut couvrir plusieurs comptes.
          </li>
          <li>
            Redémarre la plateforme (icône <em>Arrêter</em> puis <em>Démarrer</em>), reviens ici et clique{" "}
            <strong>Synchroniser maintenant</strong>.
          </li>
          <li>
            <strong>Rattachement portefeuille ↔ compte IBKR.</strong> Chaque compte IBKR (U1234567…) doit correspondre à
            un portefeuille dont l'<strong>ID Portefeuille</strong> est exactement cet identifiant. Concrètement : quand
            tu ajoutes un portefeuille à un client, mets son numéro de compte IBKR dans « ID Portefeuille » — il se
            synchronisera automatiquement. Un client peut avoir plusieurs portefeuilles/comptes. La synchro te signale
            tout compte IBKR sans portefeuille correspondant.
          </li>
        </ol>
      </Card>
    </div>
  );
}
