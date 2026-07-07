import { API_BASE_URL, USE_MOCKS } from "@/lib/env";
import type { ErrorEnvelope } from "@linkedout/contracts";
import { ApiError } from "./errors";

export interface ApiFetchInit extends RequestInit {
  /** Internal: prevents an infinite refresh loop on repeated 401s. */
  skipRefresh?: boolean;
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

/**
 * The single seam through which all backend traffic flows. Returns parsed JSON
 * typed as `T`, or throws `ApiError`. Set `NEXT_PUBLIC_USE_MOCKS=1` to serve
 * fixtures instead (the mock module is code-split out of production builds).
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  if (USE_MOCKS) {
    const { mockFetch } = await import("./mocks/router");
    return mockFetch<T>(path, init);
  }

  const { skipRefresh, ...rest } = init;
  const headers = new Headers(rest.headers);
  const cookie = await serverCookieHeader();
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
    if (code === "TOKEN_EXPIRED" && !skipRefresh) {
      await refreshSession(headers.get("cookie"));
      return apiFetch<T>(path, { ...init, skipRefresh: true });
    }
    throw toApiError(401, body);
  }

  if (!res.ok) throw toApiError(res.status, await safeJson(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Rotate the access cookie (contract §1.1). */
async function refreshSession(cookie: string | null): Promise<void> {
  await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: cookie ? { cookie } : undefined,
    cache: "no-store",
  }).catch(() => {
    /* swallow — the retried request will surface a fresh 401 if this failed */
  });
}
