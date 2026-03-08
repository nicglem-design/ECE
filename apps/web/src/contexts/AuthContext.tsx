"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { API_BASE } from "@/lib/api";

const TOKEN_KEY = "kanox_token";
const REFRESH_TOKEN_KEY = "kanox_refresh_token";
const EMAIL_KEY = "kanox_email";

interface AuthContextValue {
  token: string | null;
  email: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signup: (email: string, password: string, birthDate: string, acceptedTerms?: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(TOKEN_KEY);
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    if (stored && storedEmail) {
      setToken(stored);
      setEmail(storedEmail);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onAuthCleared = () => {
      setToken(null);
      setEmail(null);
    };
    window.addEventListener("auth:cleared", onAuthCleared);
    return () => window.removeEventListener("auth:cleared", onAuthCleared);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || "Login failed" };
      }
      const { token: t, refreshToken: rt, email: e } = data;
      if (t && e) {
        localStorage.setItem(TOKEN_KEY, t);
        if (rt) localStorage.setItem(REFRESH_TOKEN_KEY, rt);
        localStorage.setItem(EMAIL_KEY, e);
        setToken(t);
        setEmail(e);
        return { ok: true };
      }
      return { ok: false, error: "Invalid response" };
    } catch (err) {
      return { ok: false, error: "Could not connect to the server. Make sure the API is running." };
    }
  }, []);

  const signup = useCallback(async (email: string, password: string, birthDate: string, acceptedTerms = true) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, birthDate, acceptedTerms }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.message || "Registration failed" };
      }
      const { token: t, refreshToken: rt, email: e } = data;
      if (t && e) {
        localStorage.setItem(TOKEN_KEY, t);
        if (rt) localStorage.setItem(REFRESH_TOKEN_KEY, rt);
        localStorage.setItem(EMAIL_KEY, e);
        setToken(t);
        setEmail(e);
        return { ok: true };
      }
      return { ok: false, error: "Invalid response" };
    } catch (err) {
      return { ok: false, error: "Could not connect to the server. Make sure the API is running." };
    }
  }, []);

  const logout = useCallback(() => {
    const refreshToken = typeof window !== "undefined" ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
    if (refreshToken) {
      fetch(`${API_BASE}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      }).catch(() => {});
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    setToken(null);
    setEmail(null);
  }, []);

  const value: AuthContextValue = {
    token,
    email,
    isAuthenticated: !!token,
    login,
    signup,
    logout,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
