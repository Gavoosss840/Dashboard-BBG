import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { getToken, setToken, clearToken } from "../api/client";
import type { User } from "../api/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  needsBootstrap: boolean;
  bootstrap: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const token = getToken();
      if (!token) {
        const status = await api.bootstrapStatus();
        setNeedsBootstrap(status.needs_bootstrap);
        setUser(null);
        return;
      }
      const me = await api.me();
      setUser(me);
    } catch {
      clearToken();
      setUser(null);
      try {
        const status = await api.bootstrapStatus();
        setNeedsBootstrap(status.needs_bootstrap);
      } catch {
        // backend unreachable — leave needsBootstrap as-is
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      setUser(null);
      refresh();
    };
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap(name: string, email: string, password: string) {
    const res = await api.bootstrap(name, email, password);
    setToken(res.access_token);
    setUser(res.user);
    setNeedsBootstrap(false);
  }

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    setToken(res.access_token);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, needsBootstrap, bootstrap, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
