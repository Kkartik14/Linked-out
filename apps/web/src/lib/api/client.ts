import { API_BASE_URL } from "@/lib/env";
import type { ErrorEnvelope } from "@linkedout/contracts";
import { ApiError } from "./errors";

export interface ApiFetchInit extends RequestInit {
  /** Internal: prevents an infinite refresh loop on repeated 401s. */
  skipRefresh?: boolean;
  /** Internal: server-side retry cookie after a refresh response sets cookies. */
  cookieHeader?: string;
}

/**
 * On the server, forward the incoming request's cookies so the backend sees the
 * session. On the client, `credentials: "include"` sends them automatically.
 * `next/headers` is imported dynamically so it never lands in the client bundle.
 */
async function serverCookieHeader(): Promise<string | null> {
  if (typeof window !== "undefined") return null;
  try {
    const { cookies } = await import("next/headers");
    const value = (await cookies()).toString();
    return value || null;
  } catch {
    // Not inside a request scope (e.g. static generation) — nothing to forward.
    return null;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const err = (body as ErrorEnvelope | null)?.error;
  return new ApiError(
    status,
    err?.code ?? "UNKNOWN",
    err?.message ?? `Request failed (${status}).`,
    err?.details,
  );
}

function splitSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/g).map((part) => part.trim()).filter(Boolean);
}

function mergeCookieHeader(current: string | null, setCookies: string[]): string | null {
  if (setCookies.length === 0) return current;

  const cookies = new Map<string, string>();
  for (const part of current?.split(";") ?? []) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq > 0) cookies.set(trimmed.slice(0, eq), trimmed.slice(eq + 1));
  }

  for (const setCookie of setCookies) {
    const pair = setCookie.split(";", 1)[0]?.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq > 0) cookies.set(pair.slice(0, eq), pair.slice(eq + 1));
  }

  const merged = [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
  return merged || null;
}

function setCookiesFrom(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.();
  if (setCookies?.length) return setCookies;
  const joined = headers.get("set-cookie");
  return joined ? splitSetCookie(joined) : [];
}

/**
 * The single seam through which all backend traffic flows. Returns parsed JSON
 * typed as `T`, or throws `ApiError`.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { skipRefresh, cookieHeader, ...rest } = init;
  const headers = new Headers(rest.headers);
  const cookie = cookieHeader ?? await serverCookieHeader();
  if (cookie) headers.set("cookie", cookie);
  if (rest.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: "include",
    // Per-user/authenticated data must never be statically cached.
    cache: rest.cache ?? "no-store",
  });

  if (res.status === 401) {
    const body = await safeJson(res);
    const code = (body as ErrorEnvelope | null)?.error?.code;
    if (code === "TOKEN_EXPIRED" && !skipRefresh && typeof window !== "undefined") {
      const refreshedCookie = await refreshSession(headers.get("cookie"));
      return apiFetch<T>(path, {
        ...init,
        skipRefresh: true,
        cookieHeader: refreshedCookie ?? cookieHeader,
      });
    }
    throw toApiError(401, body);
  }

  if (!res.ok) throw toApiError(res.status, await safeJson(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Rotate the access cookie (contract §1.1). */
async function refreshSession(cookie: string | null): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: cookie ? { cookie } : undefined,
      cache: "no-store",
    });
    return mergeCookieHeader(cookie, setCookiesFrom(res.headers));
  } catch {
    // The retried request will surface a fresh 401 if refresh failed.
    return null;
  }
}
