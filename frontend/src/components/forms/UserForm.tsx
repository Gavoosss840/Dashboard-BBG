import { useState } from "react";
import type { User, UserInput } from "../../api/types";
import { Field, FormGrid, FormActions, inputClass } from "../ui/form";

const DEFAULTS: UserInput = {
  name: "",
  email: "",
  role: "associate",
  title: "",
  phone: "",
  avatar_initials: "",
  active: true,
  joined_date: new Date().toISOString().slice(0, 10),
  bio: "",
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function UserForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: User;
  onSubmit: (data: UserInput, password?: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<UserInput>(
    initial
      ? {
          name: initial.name,
          email: initial.email,
          role: initial.role,
          title: initial.title,
          phone: initial.phone,
          avatar_initials: initial.avatar_initials,
          active: initial.active,
          joined_date: initial.joined_date,
          bio: initial.bio,
        }
      : DEFAULTS
  );
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof UserInput>(key: K, value: UserInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    if (password && password.length < 8) {
      setPasswordError("Le mot de passe doit faire au moins 8 caractères.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ ...form, avatar_initials: form.avatar_initials || initials(form.name) }, password || undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <FormGrid>
        <Field label="Nom" span2>
          <input required className={inputClass} value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" required className={inputClass} value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Rôle">
          <select className={inputClass} value={form.role} onChange={(e) => set("role", e.target.value)}>
            <option value="admin">Admin</option>
            <option value="associate">Associé</option>
            <option value="analyst">Analyste</option>
            <option value="viewer">Lecture seule</option>
          </select>
        </Field>
        <Field label="Titre" span2>
          <input className={inputClass} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Téléphone">
          <input className={inputClass} value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Depuis le">
          <input type="date" className={inputClass} value={form.joined_date} onChange={(e) => set("joined_date", e.target.value)} />
        </Field>
        <Field label="Bio" span2>
          <textarea className={inputClass} rows={2} value={form.bio} onChange={(e) => set("bio", e.target.value)} />
        </Field>
        <Field label={initial ? "Nouveau mot de passe (laisser vide pour ne pas changer)" : "Mot de passe (optionnel, active la connexion)"} span2>
          <input
            type="password"
            minLength={password ? 8 : undefined}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={initial?.has_login ? "Connexion déjà activée" : "Aucune connexion pour l'instant"}
          />
          {passwordError && <span className="mt-1 block text-xs text-[var(--status-critical)]">{passwordError}</span>}
        </Field>
      </FormGrid>
      <FormActions onCancel={onCancel} busy={busy} submitLabel={initial ? "Enregistrer" : "Créer l'utilisateur"} />
    </form>
  );
}
