import { isSafeReturnTo } from "@linkedout/contracts/v2";

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
 * OAuth failures arrive as a `?error=` code on a redirect the backend issues, not in an API
 * error envelope, so there is no server-composed `message` to render and the copy has to live
 * here. That makes this the one place in the app that composes business copy from a machine
 * code, against CLAUDE.md §0 — see TODO(contract) below.
 *
 * TODO(contract): have the callback redirect carry a ready-to-display message, the way every
 * API error envelope already does, and delete this table.
 */
const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You cancelled the sign-in. Try again whenever you're ready.",
  oauth_failed: "Something went wrong with the provider. Please try again.",
  email_taken: "That email is already linked to a different login method.",
};

/** `null` when no error code is present — callers render nothing in that case. */
export function oauthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? "Sign-in failed. Please try again.";
}
