import { isSafeReturnTo } from "@linkedout/contracts";
import { notFound, redirect } from "next/navigation";

import { isApiError } from "@/lib/api";

/**
 * How a public page translates an API failure into navigation.
 *
 * The public API's optional-auth reads do not downgrade a presented-but-invalid credential to a guest
 * response — they reject it with `401` (public contract §2, "not silently treated as guest").
 * A stale or corrupt `lo_access` cookie therefore fails even a public read.
 *
 * The frontend cannot clear an httpOnly cookie from a Server Component — there is no
 * routing boundary to set a response header (ADR 0001 §1.1) — so it cannot heal the
 * session itself. Sending the viewer to `/login` is the one recoverable answer: it does
 * not pretend the credential is valid, and it does not quietly re-fetch as a guest, which
 * would just move the contract's forbidden downgrade into the client.
 *
 * Remove this when the BFF/session boundary lands and a broken session is cleared at the
 * edge instead of at every page.
 *
 * `returnTo` is validated rather than trusted. Every caller passes a literal path today, so
 * this is defense-in-depth, not a live hole — but it is the same rule `oauthLoginUrl` and
 * the login/onboarding/auth-callback pages already apply, and a returnTo that reaches a
 * redirect is exactly where an open redirect would appear if a caller ever interpolated
 * user input. Unsafe values fall back to `/` rather than throwing: this runs on a failure
 * path, and losing the return destination beats failing the recovery entirely.
 */
export function redirectIfCredentialRejected(err: unknown, returnTo: string): void {
  if (isApiError(err) && err.status === 401) {
    const safe = isSafeReturnTo(returnTo) ? returnTo : "/";
    redirect(`/login?returnTo=${encodeURIComponent(safe)}`);
  }
}

/**
 * For a public page that cannot render without its data: a rejected credential goes to
 * login, a missing resource to the not-found page, and anything else is a real error and
 * is left to the error boundary.
 */
export function publicReadFailure(err: unknown, returnTo: string): never {
  redirectIfCredentialRejected(err, returnTo);
  if (isApiError(err) && err.status === 404) notFound();
  throw err;
}
