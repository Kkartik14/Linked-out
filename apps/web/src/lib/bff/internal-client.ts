import "server-only";

import { BffCallerAssertionSigner, INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";

import { validatedHttpOrigin } from "./origin-validation";
import { relatedApiOrigin } from "./related-api-origin";

const VERCEL_PROTECTION_BYPASS_HEADER = "x-vercel-protection-bypass";

/**
 * The shared BFF → private-Nest client (ADR 0001 §4.2).
 *
 * One module owns the purpose-scoped caller signer, the validated internal origin, and the
 * fail-closed POST that every session-lifecycle call uses (resolve, revoke, handoff exchange).
 * The security-sensitive origin validation lives here once rather than being copied per endpoint,
 * where the copies would drift.
 *
 * **Server only.** The `server-only` marker rejects Client Component imports at build time; the
 * runtime guard is defense in depth. `BFF_CALLER_SECRET` proves only "the BFF is calling" — it is
 * never the Nest API-assertion key and cannot mint a user identity.
 */

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("The BFF internal client is server-only and must never run in the browser.");
  }
}

interface InternalClientConfig {
  signer: BffCallerAssertionSigner;
  apiBaseUrl: string;
  protectionBypassSecret: string | null;
}

let config: InternalClientConfig | null = null;

/**
 * Built once and memoised: the signer only holds the secret, and re-validating the origin on
 * every request buys nothing. Constructed lazily so importing this module never requires the
 * secret to be present — only calling it does.
 */
function getConfig(): InternalClientConfig {
  if (config) return config;

  const secret = process.env.BFF_CALLER_SECRET;
  const configuredBaseUrl = relatedApiOrigin();
  if (!secret) throw new Error("BFF_CALLER_SECRET is required to call the private session API.");
  if (!configuredBaseUrl) {
    throw new Error("INTERNAL_API_BASE_URL is required to call the private session API.");
  }

  const apiBaseUrl = validatedHttpOrigin(configuredBaseUrl, "INTERNAL_API_BASE_URL");
  config = {
    signer: new BffCallerAssertionSigner(secret),
    apiBaseUrl,
    protectionBypassSecret: process.env.INTERNAL_API_BYPASS_SECRET || null,
  };
  return config;
}

/**
 * The purpose-scoped caller signer. Call the specific method (`signSessionResolve`,
 * `signSessionRevoke`, `signAuthExchange`) at the call site so each endpoint proves its own
 * purpose. Asserts server-side first, so a browser call throws before the secret is touched.
 */
export function bffCallerSigner(): BffCallerAssertionSigner {
  assertServer();
  return getConfig().signer;
}

/**
 * The validated private Nest origin ordinary `/v1/*` traffic is forwarded to. Same validation as
 * the lifecycle calls (no credentials, no path, HTTPS in production), so the forward target can
 * never be a misconfigured or attacker-influenced URL.
 */
export function internalApiOrigin(): string {
  assertServer();
  return getConfig().apiBaseUrl;
}

/**
 * Replace any browser-supplied Vercel bypass credential with the server-only API project secret.
 * Empty in deployments whose API previews are public.
 */
export function applyInternalApiProtection(headers: Headers): void {
  assertServer();
  headers.delete(VERCEL_PROTECTION_BYPASS_HEADER);
  const secret = getConfig().protectionBypassSecret;
  if (secret) headers.set(VERCEL_PROTECTION_BYPASS_HEADER, secret);
}

/** A slow private hop must not hold a render open indefinitely; fail closed instead. */
const DEFAULT_TIMEOUT_MS = 3_000;

/**
 * POST to a private BFF lifecycle endpoint with a purpose-scoped caller assertion, then parse the
 * response with the caller's schema.
 *
 * A network or protocol failure **throws** rather than resolving to a "not live" answer: "the
 * call failed" and "this credential names no live session" are different facts, and collapsing
 * them would let an outage read as a clean sign-out (AUTH-06). Parsing against the shared schema
 * makes a wire drift a loud failure here rather than a silently wrong session.
 */
export async function postInternal<T>(
  path: string,
  assertion: string,
  body: unknown,
  parse: (json: unknown) => T,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  assertServer();
  const { apiBaseUrl } = getConfig();

  const headers = new Headers({
    "content-type": "application/json",
    [INTERNAL_AUTH_HEADER]: assertion,
  });
  applyInternalApiProtection(headers);

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`Internal BFF call ${path} failed with status ${response.status}.`);
  }
  return parse(await response.json());
}
