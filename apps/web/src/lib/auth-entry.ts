import {
  OAUTH_FAILURES,
  isSafeReturnTo,
  oauthFailureCodeSchema,
} from "@linkedout/contracts";

/**
 * Shared by the three auth entry points — `/login`, `/auth/callback`, `/onboarding` — each of
 * which reads a `returnTo` and an OAuth `error` code straight off the URL.
 *
 * They previously carried a private copy of both, and the copies had already drifted: the
 * login page apologised at greater length than the callback for the same `access_denied`.
 */

/**
 * A `returnTo` is attacker-supplied — it arrives as a query parameter — so an unvetted value
 * is an open redirect. `isSafeReturnTo` is the contract's own validator; the fallback keeps
 * the caller total, since every call site has to navigate somewhere.
 */
export function safeReturnTo(value: string | null | undefined): string {
  return value && isSafeReturnTo(value) ? value : "/";
}

/**
 * OAuth failure copy is the backend's, and now lives in the shared contract as
 * `OAUTH_FAILURES` rather than in a table here.
 *
 * Keyed off the `error` code, deliberately **not** the `message` the redirect also carries.
 * A query parameter is attacker-supplied: anyone can send a victim a link to the real
 * `/auth/callback?error=oauth_failed&message=…` and have our own sign-in page render their
 * words. React escapes markup so it is not XSS — but "Your account is locked, call
 * 1-800-…", rendered by the genuine site under its own domain and styling, *is* the attack;
 * the markup was never the point. This is the reasoning behind the OAuth 2.0 Security BCP
 * treating `error_description` as developer-facing and not for end users.
 *
 * Taking the copy from the contract instead costs nothing that matters here: the codes are
 * a closed enum of three, so the message is knowable from the code alone, and the backend
 * still owns the words. The one thing it gives up is changing that wording without a
 * contracts bump — a real trade, but not one worth rendering unauthenticated text for.
 */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  const known = oauthFailureCodeSchema.safeParse(code);
  // The fallback stays frontend copy on purpose: an unrecognised code is by definition one
  // the contract has no words for, so there is nothing to render but our own.
  return known.success ? OAUTH_FAILURES[known.data].message : "Sign-in failed. Please try again.";
}
