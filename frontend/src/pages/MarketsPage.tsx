import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import type { LiveNewsItem, MarketGroup } from "../api/types";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";
import { formatNumber, formatPct } from "../lib/format";

const POLL_MS = 30_000;

const GROUP_LABEL: Record<string, string> = {
  indices: "Indices",
  fx: "Devises",
  commodities: "Matières premières",
  crypto: "Crypto",
  rates: "Taux US (%)",
};

// French display names where Yahoo's are missing or anglophone
const SYMBOL_LABEL: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq Composite",
  "^DJI": "Dow Jones",
  "^FCHI": "CAC 40",
  "^GDAXI": "DAX",
  "^FTSE": "FTSE 100",
  "^STOXX50E": "Euro Stoxx 50",
  "^N225": "Nikkei 225",
  "^HSI": "Hang Seng",
  "EURUSD=X": "EUR/USD",
  "GBPUSD=X": "GBP/USD",
  "USDJPY=X": "USD/JPY",
  "USDCHF=X": "USD/CHF",
  "EURCHF=X": "EUR/CHF",
  "EURGBP=X": "EUR/GBP",
  "GC=F": "Or",
  "SI=F": "Argent",
  "CL=F": "Pétrole WTI",
  "BZ=F": "Brent",
  "NG=F": "Gaz naturel",
  "HG=F": "Cuivre",
  "BTC-USD": "Bitcoin",
  "ETH-USD": "Ethereum",
  "SOL-USD": "Solana",
  "^IRX": "US 3 mois",
  "^FVX": "US 5 ans",
  "^TNX": "US 10 ans",
  "^TYX": "US 30 ans",
};

function GroupCard({ group }: { group: MarketGroup }) {
  return (
    <Card title={GROUP_LABEL[group.group] ?? group.group}>
      <table className="w-full text-sm">
        <tbody>
          {group.quotes.map((q) => {
            const up = q.change_pct >= 0;
            return (
              <tr key={q.symbol} className="border-t border-white/5 first:border-t-0">
                <td className="py-1.5">
                  <Link
                    to={`/security/${encodeURIComponent(q.symbol)}`}
                    className="font-medium hover:text-[var(--series-1)] hover:underline"
                  >
                    {SYMBOL_LABEL[q.symbol] ?? q.name}
                  </Link>
                </td>
                <td className="tabular py-1.5 text-right">
                  {formatNumber(q.price, q.price < 10 ? 4 : 2)}
                </td>
                <td
                  className="tabular py-1.5 pl-3 text-right"
                  style={{ color: up ? "var(--status-good)" : "var(--status-critical)" }}
                >
                  {up ? "▲" : "▼"} {formatPct(q.change_pct, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function MarketsPage() {
  const [groups, setGroups] = useState<MarketGroup[] | null>(null);
  const [news, setNews] = useState<LiveNewsItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.marketsOverview();
        if (!cancelled) {
          setGroups(data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled && !groups) setError(e instanceof Error ? e.message : String(e));
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    api
      .liveNews()
      .then(setNews)
      .catch(() => setNews([]));
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!groups) return <LoadingState />;

  return (
    <div>
      <PageHeader title="Marchés" subtitle="Vue globale — rafraîchie toutes les 30 s, cliquer une ligne ouvre sa page titre" />
      <div className="grid gap-4 xl:grid-cols-3">
        <div className="grid gap-4 sm:grid-cols-2 xl:col-span-2">
          {groups.map((g) => (
            <GroupCard key={g.group} group={g} />
          ))}
        </div>
        <Card title="Dernières actualités (watchlist)">
          {!news && <LoadingState />}
          {news && news.length === 0 && (
            <div className="text-sm text-[var(--text-muted)]">
              Ajoutez des valeurs à la watchlist pour alimenter le fil d'actualités.
            </div>
          )}
          {news && news.length > 0 && (
            <div className="max-h-[70vh] divide-y divide-white/5 overflow-y-auto pr-1">
              {news.map((n, i) => (
                <a
                  key={i}
                  href={n.link}
                  target="_blank"
                  rel="noreferrer"
                  className="block py-2.5 first:pt-0 hover:bg-white/[0.03]"
                >
                  <div className="text-sm font-medium leading-snug">{n.title}</div>
                  <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                    <span className="text-[var(--series-1)]">{n.symbol}</span> · {n.publisher}
                    {n.published_at != null &&
                      ` · ${new Date(n.published_at * 1000).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}`}
                  </div>
                </a>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
