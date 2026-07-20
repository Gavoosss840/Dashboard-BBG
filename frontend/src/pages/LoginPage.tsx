import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { inputClass } from "../components/ui/form";

function extractErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return "Erreur inconnue";
  const withoutPrefix = err.message.replace(/^API error \d+ on [^:]+: /, "");
  try {
    const parsed = JSON.parse(withoutPrefix);
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    // not JSON — fall through to the raw string
  }
  return withoutPrefix;
}

export function LoginPage() {
  const { needsBootstrap, bootstrap, login } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsBootstrap && password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      if (needsBootstrap) {
        await bootstrap(name, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[var(--surface-0)] text-[var(--text-primary)]">
      <div className="w-full max-w-sm rounded-lg border border-white/10 bg-[var(--surface-1)] p-6">
        <div className="mb-6 text-center">
          <div className="text-lg font-bold tracking-wide">B. HORIZON CAPITAL</div>
          <div className="text-xs text-[var(--text-muted)]">
            {needsBootstrap ? "Créer le compte administrateur" : "Internal Terminal"}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {needsBootstrap && (
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Nom</label>
              <input required className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Email</label>
            <input
              type="email"
              required
              className={inputClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">Mot de passe</label>
            <input
              type="password"
              required
              minLength={needsBootstrap ? 8 : undefined}
              className={inputClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
            />
          </div>
          {needsBootstrap && (
            <div>
              <label className="mb-1 block text-xs text-[var(--text-muted)]">Confirmer le mot de passe</label>
              <input
                type="password"
                required
                minLength={8}
                className={inputClass}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="rounded border border-[var(--status-critical)]/30 bg-[var(--status-critical)]/10 px-3 py-2 text-xs text-[var(--status-critical)]">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-[var(--series-1)] px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "…" : needsBootstrap ? "Créer le compte et se connecter" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
