import type { ReactNode } from "react";

export const inputClass =
  "w-full rounded border border-white/10 bg-[var(--surface-2)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--series-1)]";

export function Field({ label, children, span2 = false }: { label: string; children: ReactNode; span2?: boolean }) {
  return (
    <label className={`block ${span2 ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-xs text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

export function FormActions({
  onCancel,
  submitLabel = "Enregistrer",
  busy = false,
}: {
  onCancel: () => void;
  submitLabel?: string;
  busy?: boolean;
}) {
  return (
    <div className="mt-5 flex justify-end gap-2">
      <button
        type="button"
        onClick={onCancel}
        className="rounded border border-white/10 px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-white/5"
      >
        Annuler
      </button>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-[var(--series-1)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "…" : submitLabel}
      </button>
    </div>
  );
}

export function DeleteButton({ onConfirm, label = "Supprimer" }: { onConfirm: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm("Confirmer la suppression ? Cette action est irréversible.")) onConfirm();
      }}
      className="rounded border border-white/10 px-3 py-1.5 text-sm text-[var(--status-critical)] hover:border-[var(--status-critical)] hover:bg-[var(--status-critical)]/10"
    >
      {label}
    </button>
  );
}
