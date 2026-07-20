export type SessionMode = "legacy" | "handoff";

/**
 * The OAuth/session topology (ADR 0001). `legacy` = the browser calls Nest directly with the
 * `lo_access`/`lo_refresh` cookies (today's runnable path); `handoff` = the one-origin BFF, where
 * the browser holds only `lo_sid` and `proxy.ts` + the BFF route handlers resolve it.
 *
 * Only the exact string `"handoff"` enables the BFF path; every other value — including unset —
 * resolves to `legacy`. The asymmetry is deliberate: an ambiguous or missing config must never
 * silently route real traffic through the not-yet-deployed handoff path (ADR 0001 §4.5, "keep
 * OAUTH_SESSION_MODE=legacy until the full public BFF path is deployed").
 *
 * Server-only by construction — it reads a non-`NEXT_PUBLIC_` variable, so in a client bundle
 * `process.env.OAUTH_SESSION_MODE` is `undefined` and this returns `legacy`. `proxy.ts` and the
 * BFF route handlers are the intended callers; both run on the server. Mirrors the API's own
 * `OAUTH_SESSION_MODE` so the two tiers flip together.
 */
export function sessionMode(): SessionMode {
  return process.env.OAUTH_SESSION_MODE === "handoff" ? "handoff" : "legacy";
}

export function isHandoffMode(): boolean {
  return sessionMode() === "handoff";
}
