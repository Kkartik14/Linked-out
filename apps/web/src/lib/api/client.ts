import { API_BASE_URL } from "@/lib/env";
import type { ErrorEnvelope } from "@linkedout/contracts/v2";
import { PRINCIPAL_BINDING_HEADER } from "@linkedout/contracts/v2";
import type { ComposedPrincipal } from "@/lib/principal";
import { ApiError } from "./errors";

export interface ApiFetchInit extends RequestInit {
  /** Internal: prevents an infinite refresh loop on repeated 401s. */
  skipRefresh?: boolean;
  /** Overrides {@link DEFAULT_TIMEOUT_MS}. Use for a request the page can live without. */
  timeoutMs?: number;
  /**
   * Render-time identity for an authenticated mutation. The API rejects any authenticated
   * unsafe method whose declaration is missing or disagrees with the live credential
   * (`409 PRINCIPAL_MISMATCH`), so every mutating endpoint must carry one — see
   * {@link ComposedPrincipal} for why it may not be read from the current session.
   */
  principal?: ComposedPrincipal;
}

/**
 * No request may hang forever. A Server Component render blocks on its fetches, so an
 * unresponsive backend would hold the whole page open until the platform kills it — and
 * anything relying on a rejection to degrade (contract v2 §2: the sidebar "fails
 * independently of the center feed") never degrades, because a request that never settles
 * never fails.
 */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Honour a caller's signal *and* the timeout — whichever aborts first wins. */
function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * On the server, forward the incoming request's cookies so the backend sees the
 * session. On the client, `credentials: "include"` sends them automatically.
 * `next/headers` is imported dynamically so it never lands in the client bundle.
 */
async function serverCookieHeader(): Promise<string | null> {
  if (typeof window !== "undefined") return null;
  const { cookies } = await import("next/headers");
  const value = (await cookies()).toString();
  return value || null;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1_000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

function toApiError(status: number, body: unknown, headers?: Headers): ApiError {
  const err = (body as ErrorEnvelope | null)?.error;
  return new ApiError(
    status,
    err?.code ?? "UNKNOWN",
    err?.message ?? `Request failed (${status}).`,
    err?.details,
    parseRetryAfter(headers?.get("retry-after") ?? null),
  );
}

/**
 * The single seam through which all backend traffic flows. Returns parsed JSON
 * typed as `T`, or throws `ApiError`.
 */
export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { skipRefresh, timeoutMs = DEFAULT_TIMEOUT_MS, principal, ...rest } = init;
  const headers = new Headers(rest.headers);
  const forwardsCredentials = rest.credentials !== "omit";
  if (!forwardsCredentials) headers.delete("cookie");
  const cookie = forwardsCredentials ? await serverCookieHeader() : null;
  if (cookie) headers.set("cookie", cookie);
  if (principal) headers.set(PRINCIPAL_BINDING_HEADER, principal);
  if (rest.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: rest.credentials ?? "include",
    // Per-user/authenticated data must never be statically cached.
    cache: rest.cache ?? "no-store",
    signal: withTimeout(rest.signal, timeoutMs),
  });

  if (res.status === 401) {
    const body = await safeJson(res);
    const code = (body as ErrorEnvelope | null)?.error?.code;
    if (
      code === "TOKEN_EXPIRED" &&
      !skipRefresh &&
      forwardsCredentials &&
      typeof window !== "undefined"
    ) {
      await refreshSessionSingleFlight();
      return apiFetch<T>(path, { ...init, skipRefresh: true });
    }
    throw toApiError(401, body, res.headers);
  }

  if (!res.ok) throw toApiError(res.status, await safeJson(res), res.headers);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Rotate the access cookie (contract §1.1).
 *
 * Nothing is read off the response, and nothing needs to be: this only ever runs in the
 * browser (see the `typeof window` guard above), where `Set-Cookie` is a forbidden response
 * header — it is stripped before JS can see it — and `Cookie` is a forbidden request header,
 * so the retry could not attach one either. The browser applies the rotated cookie to its
 * own jar, and `credentials: "include"` puts it on the retry. Any attempt to carry cookies
 * across in userland here is dead code that only appears to work under a mocked `Response`.
 */
async function refreshSession(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    // The retried request will surface a fresh 401 if refresh failed.
  }
}

/**
 * A burst of expired requests must rotate once, not once each — a second rotation would
 * race the first and could revoke the token it just issued. Module-level state is safe
 * only because refresh is browser-gated; a server-side caller would share it across users.
 */
let refreshInFlight: Promise<void> | null = null;

function refreshSessionSingleFlight(): Promise<void> {
  refreshInFlight ??= refreshSession().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}
