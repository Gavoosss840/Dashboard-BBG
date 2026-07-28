import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { SecurityNote } from "../api/types";
import { Card } from "./ui/Card";
import { LoadingState } from "./ui/States";

function fmtDate(iso: string): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SecurityNotesCard({ symbol }: { symbol: string }) {
  const [notes, setNotes] = useState<SecurityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .securityNotes(symbol)
      .then((n) => !cancelled && setNotes(n))
      .catch(() => !cancelled && setErr("Notes indisponibles."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  async function add() {
    const body = draft.trim();
    if (!body || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const note = await api.createSecurityNote(symbol, body);
      setNotes((prev) => [note, ...prev]);
      setDraft("");
    } catch {
      setErr("Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    const prev = notes;
    setNotes((n) => n.filter((x) => x.id !== id));
    try {
      await api.deleteSecurityNote(id);
    } catch {
      setNotes(prev); // rollback
      setErr("Suppression impossible.");
    }
  }

  return (
    <Card
      title="Notes de recherche"
      action={
        <span className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
          {notes.length} {notes.length > 1 ? "notes" : "note"}
        </span>
      }
    >
      <div className="mb-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") add();
          }}
          rows={3}
          placeholder="Ce que vous avez observé en analyse — thèse, catalyseurs, points de vigilance…"
          className="w-full resize-y rounded-md border border-white/10 bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[10px] text-[var(--text-muted)]">⌘/Ctrl + ↵ pour enregistrer</span>
          <button
            onClick={add}
            disabled={!draft.trim() || saving}
            className="rounded-md bg-[var(--series-1)] px-3 py-1.5 text-xs font-medium text-black disabled:opacity-40"
          >
            {saving ? "…" : "Ajouter"}
          </button>
        </div>
        {err && <div className="mt-1 text-xs text-[var(--status-critical)]">{err}</div>}
      </div>

      {loading ? (
        <LoadingState />
      ) : notes.length === 0 ? (
        <div className="py-4 text-center text-sm text-[var(--text-muted)]">
          Aucune note pour l'instant.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div
              key={n.id}
              className="group rounded-md border border-white/5 bg-[var(--surface-2)] px-3 py-2"
            >
              <div className="mb-1 flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                <span>
                  {fmtDate(n.created_at)}
                  {n.author_name ? ` · ${n.author_name}` : ""}
                </span>
                <button
                  onClick={() => remove(n.id)}
                  className="opacity-0 transition group-hover:opacity-100 hover:text-[var(--status-critical)]"
                  title="Supprimer"
                >
                  Supprimer
                </button>
              </div>
              <div className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{n.body}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
