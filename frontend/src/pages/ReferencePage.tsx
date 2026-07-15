import { useState } from "react";
import { api } from "../api/client";
import { useApi } from "../lib/useApi";
import { Card } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";
import { LoadingState, ErrorState } from "../components/ui/States";

const CATEGORIES = [
  { key: "all", label: "Tout" },
  { key: "fees", label: "Frais" },
  { key: "glossary", label: "Glossaire" },
  { key: "procedure", label: "Procédures" },
  { key: "legal", label: "Juridique" },
];

export function ReferencePage() {
  const [category, setCategory] = useState("all");
  const { data, loading, error } = useApi(() => api.reference(category === "all" ? undefined : category), [category]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Référence"
        subtitle="Glossaire, structure des frais et procédures internes"
        action={
          <div className="flex gap-1">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                onClick={() => setCategory(c.key)}
                className={`rounded px-2 py-1 text-xs ${
                  category === c.key ? "bg-[var(--series-1)]/20 text-[var(--series-1)]" : "text-[var(--text-muted)] hover:bg-white/5"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {data.map((entry) => (
          <Card key={entry.id} title={entry.title}>
            <p className="text-sm text-[var(--text-secondary)]">{entry.content}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
