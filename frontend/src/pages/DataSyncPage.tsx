import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatDateTime } from "../lib/format";
import type { IbkrTestResult, SyncLog } from "../api/types";

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

function IbkrConnectionsCard({ onChanged }: { onChanged: () => void }) {
  const { data, loading, error, reload } = useApi(() => api.ibkrConnections(), []);
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [queryId, setQueryId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, IbkrTestResult | "pending">>({});

  async function addConnection(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await api.createIbkrConnection({ label, token, query_id: queryId });
      setLabel("");
      setToken("");
      setQueryId("");
      reload();
      onChanged();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeConnection(id: string) {
    if (!window.confirm("Supprimer cette connexion IBKR ?")) return;
    await api.deleteIbkrConnection(id);
    reload();
    onChanged();
  }

  async function testConnection(id: string) {
    setTestResults((r) => ({ ...r, [id]: "pending" }));
    const result = await api.testIbkrConnection(id);
    setTestResults((r) => ({ ...r, [id]: result }));
  }

  return (
    <Card
      className="mt-4"
      title="Connexions IBKR"
      action={
        <span className="text-xs text-[var(--text-muted)]">
          Ajoute un token directement ici — plus besoin d'éditer de fichier ni de redémarrer.
        </span>
      }
    >
      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && data.length > 0 && (
        <div className="mb-4 divide-y divide-white/5">
          {data.map((c) => {
            const result = testResults[c.id];
            return (
              <div key={c.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">{c.label}</span>{" "}
                    <span className="text-[var(--text-muted)]">
                      · Query ID {c.query_id} · token {c.token_masked}
                    </span>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => testConnection(c.id)}
                      disabled={result === "pending"}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--series-1)] disabled:opacity-50"
                    >
                      {result === "pending" ? "Test en cours…" : "Tester"}
                    </button>
                    <button
                      onClick={() => removeConnection(c.id)}
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--status-critical)]"
                    >
                      supprimer
                    </button>
                  </div>
                </div>
                {result && result !== "pending" && (
                  <p
                    className="mt-1 text-xs"
                    style={{ color: result.ok ? "var(--status-good)" : "var(--status-critical)" }}
                  >
                    {result.message}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {data && data.length === 0 && (
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          Aucune connexion enregistrée via l'interface. Le token, une fois enregistré ici, reste uniquement sur ta
          machine — dans un fichier séparé de la base de données, jamais inclus dans les sauvegardes.
        </p>
      )}

      <form onSubmit={addConnection} className="grid grid-cols-1 gap-2 sm:grid-cols-4 sm:items-end">
        <label className="text-xs">
          <div className="mb-1 text-[var(--text-muted)]">Libellé (ex : Client A)</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
          />
        </label>
        <label className="text-xs">
          <div className="mb-1 text-[var(--text-muted)]">Token Flex</div>
          <div className="flex gap-1">
            <input
              required
              type={showToken ? "text" : "password"}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
            />
            <button
              type="button"
              onClick={() => setShowToken((v) => !v)}
              className="shrink-0 rounded border border-white/10 px-2 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              {showToken ? "masquer" : "voir"}
            </button>
          </div>
        </label>
        <label className="text-xs">
          <div className="mb-1 text-[var(--text-muted)]">Query ID</div>
          <input
            required
            value={queryId}
            onChange={(e) => setQueryId(e.target.value)}
            className="w-full rounded border border-white/10 bg-[var(--surface-2)] px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]"
          />
        </label>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Enregistrement…" : "+ Ajouter la connexion"}
        </button>
      </form>
      {formError && <p className="mt-2 text-xs text-[var(--status-critical)]">{formError}</p>}
    </Card>
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
                : "Non configuré : ajoute une connexion ci-dessous (ou renseigne IBKR_FLEX_TOKEN dans docker-compose.yml)."}
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

      <IbkrConnectionsCard onChanged={reload} />

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
          avoir une copie hors machine. Les connexions IBKR ajoutées ci-dessus vivent dans un fichier séparé et ne sont
          jamais incluses dans ces sauvegardes.
        </p>
        <SyncResult log={data.last_backup} />
      </Card>

      <Card className="mt-4" title="Guide — connecter un compte IBKR (une seule fois par compte)">
        <ol className="list-decimal space-y-3 pl-5 text-sm text-[var(--text-secondary)]">
          <li>
            Connecte-toi à <strong>IBKR Account Management</strong> (interactivebrokers.com) →{" "}
            <strong>Performance & Reports → Flex Queries</strong> → crée une <strong>Activity Flex Query</strong>.
            C'est une étape manuelle côté IBKR — ils ne proposent pas de connexion directe en un clic pour ce type
            d'accès.
          </li>
          <li>
            Coche ces sections (toutes les colonnes) : <strong>Open Positions</strong>, <strong>Trades</strong>,{" "}
            <strong>Cash Transactions</strong>, <strong>Cash Report</strong>,{" "}
            <strong>Net Asset Value (NAV) in Base</strong>. Période : <strong>Last Business Day</strong> (pour la{" "}
            <em>toute première</em> synchro, mets plutôt <em>Last 365 Calendar Days</em> le temps d'un premier import,
            afin de rattraper l'historique de NAV, les trades et les dépôts de l'année — puis repasse sur{" "}
            <em>Last Business Day</em>). Format : <strong>XML</strong>. Note le <strong>Query ID</strong> affiché
            après création.
          </li>
          <li>
            Puis <strong>Settings → Account Settings → Flex Web Service</strong> → active-le et génère un{" "}
            <strong>token</strong>.
          </li>
          <li className="rounded border border-[var(--series-1)]/25 bg-[var(--series-1)]/[0.05] p-3">
            <strong>Colle le token et le Query ID dans le formulaire « Connexions IBKR » ci-dessus</strong>, donne-lui
            un libellé (ex : le nom du client), clique <strong>+ Ajouter la connexion</strong>. C'est actif
            immédiatement — pas besoin d'éditer de fichier ni de redémarrer la plateforme. Utilise{" "}
            <strong>Tester</strong> pour vérifier tout de suite que la connexion fonctionne et voir quel(s) compte(s)
            elle couvre. Répète l'opération pour chaque login IBKR supplémentaire (ex : un login par client) — une
            seule connexion suffit si tes comptes sont regroupés sous un login advisor/master.
          </li>
          <li>
            <strong>Rattachement portefeuille ↔ compte IBKR.</strong> Chaque compte IBKR (U1234567…) doit correspondre à
            un portefeuille dont l'<strong>ID Portefeuille</strong> est exactement cet identifiant. Concrètement : quand
            tu ajoutes un portefeuille à un client, mets son numéro de compte IBKR dans « ID Portefeuille » — il se
            synchronisera automatiquement. Un client peut avoir plusieurs portefeuilles/comptes. La synchro te signale
            tout compte IBKR sans portefeuille correspondant.
          </li>
        </ol>
        <details className="mt-4 text-sm text-[var(--text-secondary)]">
          <summary className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--text-primary)]">
            Méthode alternative : renseigner le token dans docker-compose.yml
          </summary>
          <p className="mt-2">
            Toujours possible si tu préfères garder la configuration dans un fichier versionné localement (jamais dans
            git). Ouvre <code className="rounded bg-white/10 px-1">docker-compose.yml</code> et renseigne :
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs">
            {`environment:
  - IBKR_FLEX_TOKEN=ton_token_ici
  - IBKR_FLEX_QUERY_ID=ton_query_id_ici
  # plusieurs comptes :
  - IBKR_FLEX_TOKEN_1=token_client_A
  - IBKR_FLEX_QUERY_ID_1=query_client_A`}
          </pre>
          <p className="mt-2">
            Puis redémarre la plateforme (icône <em>Arrêter</em> puis <em>Démarrer</em>). ⚠ Le token reste sur ta
            machine — ne le partage jamais (ni par email, ni dans un chat).
          </p>
        </details>
      </Card>
    </div>
  );
}
