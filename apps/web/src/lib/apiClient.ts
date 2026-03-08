/**
 * API client - adds Authorization header when token is available.
 * On 401, attempts token refresh before redirecting to login.
 */
import { API_BASE } from "./api";

const TOKEN_KEY = "kanox_token";
const REFRESH_TOKEN_KEY = "kanox_refresh_token";
const EMAIL_KEY = "kanox_email";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Clear auth state and redirect to login when token is invalid/expired */
function clearAuthAndRedirect(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  window.dispatchEvent(new CustomEvent("auth:cleared"));
  window.location.href = "/login";
}

async function tryRefreshToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    const data = (await res.json().catch(() => ({}))) as { token?: string; refreshToken?: string };
    if (res.ok && data.token) {
      localStorage.setItem(TOKEN_KEY, data.token);
      if (data.refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, data.refreshToken);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  let token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.method && ["POST", "PUT", "PATCH"].includes(options.method ?? "") && options.body) {
    headers["Content-Type"] = "application/json";
  }
  let res = await fetch(url, { ...options, headers });

  if (res.status === 401 && getToken() && !path.includes("/auth/refresh")) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      token = getToken();
      if (token) headers["Authorization"] = `Bearer ${token}`;
      res = await fetch(url, { ...options, headers });
    }
  }

  return res;
}

function handleErrorResponse(res: Response, data: { message?: string }): never {
  if (res.status === 401 && getToken()) {
    clearAuthAndRedirect();
  }
  throw new Error(data?.message || "Request failed");
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await apiFetch(path);
  const data = await res.json().catch(() => ({})) as { message?: string };
  if (!res.ok) handleErrorResponse(res, data);
  return data as T;
}

export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({})) as { message?: string };
  if (!res.ok) handleErrorResponse(res, data);
  return data as T;
}

export async function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await apiFetch(path, {
    method: "PATCH",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({})) as { message?: string };
  if (!res.ok) handleErrorResponse(res, data);
  return data as T;
}
