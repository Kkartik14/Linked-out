import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { MetaEnumsResponse } from "@linkedout/contracts";

import { getMe, getMeta, isApiError } from "@/lib/api";
import { safeReturnTo } from "@/lib/auth-entry";
import { isHandoffMode } from "@/lib/bff/mode";
import { DEFAULT_META } from "@/lib/meta-fallback";
import type { Session } from "@/components/session-provider";

/**
 * Current session, deduped per request via React `cache`.
 *
 * Never throws — but, crucially, no longer flattens every failure to "logged out" (AUTH-06).
 * `/auth/me` distinguishes its answers and so does this:
 *
 *  - a viewer, or a clean guest (`200 { user: null }`) → `authenticated` / `guest`;
 *  - a rejected credential (`401`) → `rejected`, **not** `guest`: a credential was presented and
 *    the API refused it, which the contract forbids downgrading to a clean guest (§0, AUTH-06).
 *    Both still offer sign-in, but keeping them distinct is what lets a bad cookie be cleared and
 *    a single expiry invalidation published rather than pretending the visitor was never signed in;
 *  - anything else — 5xx, a network error, a timeout → `unavailable`: identity is *unknown*,
 *    which is not the same as *absent*. Rendering it as guest would turn an outage into a
 *    confident sign-out and is exactly the downgrade `public-read.ts` already refuses to make.
 */
export const getSession = cache(async (): Promise<Session> => {
  // Session identity is request data. Establish that boundary before the availability catch
  // so Next's prerender control signal can never be mistaken for an upstream outage.
  await connection();
  try {
    const me = await getMe();
    return me.user
      ? { status: "authenticated", user: me.user, needsOnboarding: me.needsOnboarding }
      : { status: "guest" };
  } catch (err) {
    if (isApiError(err) && err.status === 401) return { status: "rejected" };
    return { status: "unavailable" };
  }
});

/** A session narrowed to a present viewer — what a protected page has after {@link requireViewer}. */
type AuthenticatedSession = Extract<Session, { status: "authenticated" }>;

/**
 * Gate a protected page on a real viewer, degrading each non-authenticated state honestly.
 *
 * `guest` and `rejected` both go to `/login` — they can fix it by signing in (a rejected
 * credential needs re-auth just as an absent one does; in handoff mode the BFF edge has already
 * cleared the bad cookie by the time this runs). `unavailable` throws to the error boundary
 * instead, deliberately **not** to `/login`: we do not know they are logged out, only that we
 * could not find out, and redirecting them to sign in would assert a fact we do not have (and,
 * on a real outage, trap a signed-in user in a login loop). `returnTo` is re-validated as
 * defence-in-depth, the same rule the login and auth-callback pages apply.
 */
export function requireViewer(session: Session, returnTo: string): AuthenticatedSession {
  if (session.status === "unavailable") {
    throw new Error("We couldn't confirm your session right now. Please try again.");
  }
  if (session.status === "rejected" && isHandoffMode()) {
    redirect(
      `/auth/session/rejected?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`,
    );
  }
  if (session.status === "guest" || session.status === "rejected") {
    redirect(`/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`);
  }
  return session;
}

/**
 * Enum display metadata. React dedupes calls inside a render; `getMeta` also opts the public,
 * principal-independent fetch into Next's cross-request daily revalidation cache.
 */
export const getMetaCached = cache(async (): Promise<MetaEnumsResponse> => {
  try {
    return await getMeta();
  } catch {
    return DEFAULT_META;
  }
});
