const STATUS_STYLES: Record<string, { bg: string; fg: string }> = {
  active: { bg: "rgba(12,163,12,0.15)", fg: "var(--status-good)" },
  paid: { bg: "rgba(12,163,12,0.15)", fg: "var(--status-good)" },
  verified: { bg: "rgba(12,163,12,0.15)", fg: "var(--status-good)" },
  onboarded: { bg: "rgba(12,163,12,0.15)", fg: "var(--status-good)" },
  invoiced: { bg: "rgba(250,178,25,0.18)", fg: "var(--status-warning)" },
  pending: { bg: "rgba(250,178,25,0.18)", fg: "var(--status-warning)" },
  draft: { bg: "rgba(250,178,25,0.18)", fg: "var(--status-warning)" },
  lead: { bg: "rgba(250,178,25,0.18)", fg: "var(--status-warning)" },
  contacted: { bg: "rgba(57,135,229,0.18)", fg: "var(--series-1)" },
  meeting: { bg: "rgba(57,135,229,0.18)", fg: "var(--series-1)" },
  negotiation: { bg: "rgba(236,131,90,0.18)", fg: "var(--status-serious)" },
  overdue: { bg: "rgba(208,59,59,0.18)", fg: "var(--status-critical)" },
  lost: { bg: "rgba(208,59,59,0.18)", fg: "var(--status-critical)" },
  closed: { bg: "rgba(208,59,59,0.18)", fg: "var(--status-critical)" },
  terminated: { bg: "rgba(208,59,59,0.18)", fg: "var(--status-critical)" },
  prospect: { bg: "rgba(144,133,233,0.18)", fg: "var(--series-7)" },
};

export function Badge({ label }: { label: string }) {
  const style = STATUS_STYLES[label.toLowerCase()] ?? { bg: "rgba(137,135,129,0.18)", fg: "var(--text-muted)" };
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize"
      style={{ background: style.bg, color: style.fg }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}
