export function LoadingState() {
  return <div className="p-6 text-sm text-[var(--text-muted)]">Chargement…</div>;
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 p-4 text-sm text-[var(--status-critical)]">
      Erreur: {message}
    </div>
  );
}
