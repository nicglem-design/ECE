/**
 * API client - adds Authorization header when token is available.
 * Use this for all authenticated API calls.
 */
import { API_BASE } from "./api";

const TOKEN_KEY = "kanox_token";
const EMAIL_KEY = "kanox_email";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export async function apiFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  if (options.method && ["POST", "PUT", "PATCH"].includes(options.method) && options.body) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(url, { ...options, headers });
}

/** Clear auth state and redirect to login when token is invalid/expired */
function clearAuthAndRedirect(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EMAIL_KEY);
  window.dispatchEvent(new CustomEvent("auth:cleared"));
  window.location.href = "/login";
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
