import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { TapeQuote } from "../api/types";
import { formatNumber, formatPct } from "../lib/format";

const POLL_MS = 30_000;

export function TickerTape() {
  const [quotes, setQuotes] = useState<TapeQuote[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await api.securitiesTape();
        if (!cancelled) setQuotes(data);
      } catch {
        // keep the last good tape rather than flashing empty
      }
    }
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (quotes.length === 0) {
    return (
      <div className="flex h-8 shrink-0 items-center overflow-hidden border-b border-white/10 bg-black px-4 text-xs text-[var(--text-muted)]">
        Ajoutez des valeurs à la watchlist pour activer la bande de cotation.
      </div>
    );
  }

  // ~5s of scroll per item keeps the speed constant as the watchlist grows
  const duration = Math.max(20, quotes.length * 5);

  const renderCopy = (prefix: string, ariaHidden: boolean) =>
    quotes.map((q) => {
      const up = (q.change_pct ?? 0) >= 0;
      return (
        <button
          key={`${prefix}${q.symbol}`}
          aria-hidden={ariaHidden}
          tabIndex={ariaHidden ? -1 : undefined}
          onClick={() => navigate(`/security/${encodeURIComponent(q.symbol)}`)}
          className="flex h-8 items-center gap-2 whitespace-nowrap px-4 text-xs hover:bg-white/5"
          title={q.stale ? `${q.display} — dernière valeur connue (hors ligne)` : q.display}
        >
          <span className="font-semibold text-[var(--text-primary)]">{q.display}</span>
          <span className="tabular text-[var(--text-secondary)]">
            {q.price != null ? formatNumber(q.price) : "—"}
          </span>
          <span
            className="tabular"
            style={{ color: up ? "var(--status-good)" : "var(--status-critical)", opacity: q.stale ? 0.5 : 1 }}
          >
            {up ? "▲" : "▼"} {q.change_pct != null ? formatPct(q.change_pct, 2) : "—"}
          </span>
        </button>
      );
    });

  return (
    <div className="h-8 shrink-0 overflow-hidden border-b border-white/10 bg-black">
      <div
        className="tape-track items-center"
        style={{ "--tape-duration": `${duration}s` } as CSSProperties}
      >
        {renderCopy("a-", false)}
        {renderCopy("b-", true)}
      </div>
    </div>
  );
}
