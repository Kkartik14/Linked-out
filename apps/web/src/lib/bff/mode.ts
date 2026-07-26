export type SessionMode = "legacy" | "handoff";

/**
 * The OAuth/session topology. `handoff` = the one-origin BFF, where the browser holds only
 * `lo_sid` and `proxy.ts` + the BFF route handlers resolve it; this is what production and
 * preview run. `legacy` = the browser calls Nest directly with the `lo_access`/`lo_refresh`
 * cookies, retained for a bounded compatibility window.
 *
 * Only the exact string `"handoff"` enables the BFF path; every other value - including unset -
 * resolves to `legacy`. The asymmetry is deliberate: a typo or a missing variable must fail to
 * the mode that works without any BFF configuration, never half-enable the one that needs an
 * internal origin and a shared caller secret to function at all.
 *
 * Server-only by construction - it reads a non-`NEXT_PUBLIC_` variable, so in a client bundle
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
