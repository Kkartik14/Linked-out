import "server-only";

import {
  BffCallerAssertionSigner,
  INTERNAL_AUTH_HEADER,
} from "@linkedout/internal-auth";
import {
  sessionResolveResponseSchema,
  type SessionResolveResponse,
} from "@linkedout/contracts/v2";

/**
 * The BFF side of session resolution (ADR 0001 §4.2).
 *
 * The browser holds only the opaque `lo_sid` cookie. To learn who it belongs to, this asks the
 * private API. Nest owns the session store and returns an API-issued user assertion. The web tier
 * holds only a purpose-scoped caller key: it cannot choose `sub`/`sid`, mint user identity, or run
 * SQL. This keeps the public deployment stateless and horizontally scalable.
 *
 * **Server only.** The `server-only` marker rejects Client Component imports at build time; the
 * runtime guard is defense in depth. `BFF_CALLER_SECRET` is never the Nest API-assertion key.
 *
 * No cache yet. Revocation exists, but no logout route handler calls it until the coordinated BFF
 * cutover. Per-request resolution therefore remains the only honest default.
 */

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("session-resolver is server-only and must never run in the browser.");
  }
}

interface ResolverConfig {
  signer: BffCallerAssertionSigner;
  apiBaseUrl: string;
}

let config: ResolverConfig | null = null;

/**
 * Built once and memoised: the signer only holds the secret, and re-reading the environment on
 * every request buys nothing. Constructed lazily so importing this module never requires the
 * secret to be present — only calling it does.
 */
function getConfig(): ResolverConfig {
  if (config) return config;

  const secret = process.env.BFF_CALLER_SECRET;
  const configuredBaseUrl = process.env.INTERNAL_API_BASE_URL;
  if (!secret) throw new Error("BFF_CALLER_SECRET is required to resolve BFF sessions.");
  if (!configuredBaseUrl) {
    throw new Error("INTERNAL_API_BASE_URL is required to resolve BFF sessions.");
  }

  const parsedBaseUrl = new URL(configuredBaseUrl);
  if (
    !["http:", "https:"].includes(parsedBaseUrl.protocol) ||
    parsedBaseUrl.username.length > 0 ||
    parsedBaseUrl.password.length > 0 ||
    parsedBaseUrl.pathname !== "/" ||
    parsedBaseUrl.search.length > 0 ||
    parsedBaseUrl.hash.length > 0
  ) {
    throw new Error("INTERNAL_API_BASE_URL must be an HTTP(S) origin without credentials or a path.");
  }
  if (process.env.NODE_ENV === "production" && parsedBaseUrl.protocol !== "https:") {
    throw new Error("INTERNAL_API_BASE_URL must use HTTPS in production.");
  }

  config = {
    signer: new BffCallerAssertionSigner(secret),
    apiBaseUrl: parsedBaseUrl.origin,
  };
  return config;
}

/** A slow private hop must not hold a render open indefinitely; fail closed instead. */
const RESOLVE_TIMEOUT_MS = 3_000;

/**
 * Resolve an `lo_sid` cookie to its session, or to a reason it is not live.
 *
 * Only call this with a cookie the browser actually presented — an absent cookie is a guest the
 * caller handles locally, without a round trip. A network or protocol failure throws rather than
 * resolving: "the introspection call failed" and "this cookie names no live session" are
 * different facts, and collapsing them would let an outage read as a clean sign-out (AUTH-06).
 */
export async function resolveBffSession(cookie: string): Promise<SessionResolveResponse> {
  assertServer();
  const { signer, apiBaseUrl } = getConfig();

  const response = await fetch(`${apiBaseUrl}/v1/auth/sessions/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The purpose-scoped caller assertion. The cookie in the body is the thing being
      // resolved, not the credential the API trusts — this header is.
      [INTERNAL_AUTH_HEADER]: signer.signSessionResolve(),
    },
    body: JSON.stringify({ cookie }),
    cache: "no-store",
    signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Session resolve failed with status ${response.status}.`);
  }

  // Parsed against the same schema the endpoint is generated from, so a wire drift is a loud
  // failure here rather than a silently wrong session.
  return sessionResolveResponseSchema.parse(await response.json());
}
