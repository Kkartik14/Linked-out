import "server-only";

import {
  sessionResolveResponseSchema,
  type SessionResolveResponse,
} from "@linkedout/contracts";

import { bffCallerSigner, postInternal } from "./internal-client";

/**
 * The BFF side of session resolution (ADR 0001 §4.2).
 *
 * The browser holds only the opaque `lo_sid` cookie. To learn who it belongs to, this asks the
 * private API, authenticated with a purpose-scoped `session-resolve` caller assertion. Nest owns
 * the session store and returns an API-issued user assertion; the web tier cannot choose
 * `sub`/`sid`, mint user identity, or run SQL. The signer, validated origin, and fail-closed POST
 * live in {@link ./internal-client} and are shared with revoke and handoff exchange.
 *
 * Only call this with a cookie the browser actually presented — an absent cookie is a guest the
 * caller handles locally, without a round trip. A network or protocol failure throws rather than
 * resolving: "the introspection call failed" and "this cookie names no live session" are
 * different facts, and collapsing them would let an outage read as a clean sign-out (AUTH-06).
 */
export async function resolveBffSession(cookie: string): Promise<SessionResolveResponse> {
  return postInternal(
    "/v1/auth/sessions/resolve",
    bffCallerSigner().signSessionResolve(),
    { cookie },
    (json) => sessionResolveResponseSchema.parse(json),
  );
}
