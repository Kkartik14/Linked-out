import "server-only";

import {
  oauthHandoffExchangeResponseSchema,
  sessionRevokeResponseSchema,
  type OAuthHandoffExchangeResponse,
  type SessionRevokeResponse,
} from "@linkedout/contracts";

import { bffCallerSigner, postInternal } from "./internal-client";

/**
 * Tombstone a browser session (ADR 0001 §4.5), authenticated with a `session-revoke` caller
 * assertion. Idempotent by the API's design: revoking an absent, invalid, expired, or
 * already-revoked cookie still returns `{ ok: true }`, so a repeat logout stays a 200. Logout is
 * tombstone-first — the BFF clears `lo_sid` only after this resolves.
 */
export async function revokeBffSession(cookie: string): Promise<SessionRevokeResponse> {
  return postInternal(
    "/v1/auth/sessions/revoke",
    bffCallerSigner().signSessionRevoke(),
    { cookie },
    (json) => sessionRevokeResponseSchema.parse(json),
  );
}

/**
 * Exchange a one-time OAuth handoff code for a browser session (ADR 0001 §4.3), authenticated
 * with an `auth-exchange` caller assertion — which proves "the BFF is calling" and carries no
 * `sub`/`sid`. Nest consumes the code and creates the authoritative session in one transaction,
 * returning the opaque `lo_sid` value, its absolute (90-day) cookie expiry, and the server-bound
 * `returnTo`. The BFF sets the cookie and redirects to that `returnTo`; it never fabricates
 * `sub`, `sid`, or a destination, so there is no open-redirect surface.
 */
export async function exchangeOAuthHandoff(
  code: string,
): Promise<OAuthHandoffExchangeResponse> {
  return postInternal(
    "/v1/auth/oauth/handoff/exchange",
    bffCallerSigner().signAuthExchange(),
    { code },
    (json) => oauthHandoffExchangeResponseSchema.parse(json),
  );
}
