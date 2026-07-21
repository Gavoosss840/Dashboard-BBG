import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import {
  METRIC_CATALOG,
  loadMetricColumns,
  saveMetricColumns,
  type MetricValue,
} from "../lib/metrics";

/** Column-picker dropdown: toggle which metric columns a table shows.
 * Selection is persisted per table key in localStorage. */
export function MetricColumnPicker({
  tableKey,
  selected,
  onChange,
}: {
  tableKey: string;
  selected: string[];
  onChange: (keys: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function toggle(key: string) {
    const next = selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key];
    onChange(next);
    saveMetricColumns(tableKey, next);
  }

  const groups = Array.from(new Set(METRIC_CATALOG.map((m) => m.group)));

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-white/10 bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      >
        + Colonnes {selected.length > 0 && <span className="text-[var(--series-1)]">({selected.length})</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 max-h-96 w-64 overflow-y-auto rounded-lg border border-white/10 bg-[var(--surface-1)] p-2 shadow-xl">
          {groups.map((g) => (
            <div key={g} className="mb-2">
              <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{g}</div>
              {METRIC_CATALOG.filter((m) => m.group === g).map((m) => (
                <label
                  key={m.key}
                  className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-white/5"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(m.key)}
                    onChange={() => toggle(m.key)}
                    className="accent-[var(--series-1)]"
                  />
                  <span>{m.full}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fetches metric bags for a set of Yahoo symbols, refreshed when the symbol
 * list changes. Returns a map symbol -> { metricKey: value }. */
export function useMetrics(symbols: string[], enabled: boolean) {
  const [data, setData] = useState<Record<string, Record<string, MetricValue>>>({});
  const key = symbols.join(",");

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;
    let cancelled = false;
    api
      .securityMetrics(symbols)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        /* metrics are best-effort; leave blanks */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return data;
}

/** Persisted column state hook. */
export function useMetricColumns(tableKey: string, fallback: string[] = []) {
  const [columns, setColumns] = useState<string[]>(() => loadMetricColumns(tableKey, fallback));
  return [columns, setColumns] as const;
}
