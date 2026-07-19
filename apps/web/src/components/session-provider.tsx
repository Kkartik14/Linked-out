"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@linkedout/contracts";

import type { ComposedPrincipal } from "@/lib/principal";
import { subscribeSessionChanged, subscribeSessionExpired } from "@/lib/session-channel";

/**
 * What this tab knows about who is viewing — four genuinely different facts, not two.
 *
 *  - `authenticated` — a live viewer, with the onboarding bit the server resolved.
 *  - `guest` — **no credential was presented** (`/auth/me` answered `200 { user: null }`). A
 *    clean visitor; the offer is to sign in.
 *  - `rejected` — a credential **was** presented and the API rejected it with `401` (invalid,
 *    expired, or revoked). Not the same fact as a clean guest: the contract forbids downgrading
 *    a bad credential to guest (§0), and conflating them is what once let a client answer "am I
 *    signed in?" with "you're a guest" and never attempt recovery. Rendering is the same as
 *    guest (sign in), but the state is distinct so the broken cookie can be cleared and one
 *    expiry invalidation published instead of silently pretending nothing was wrong.
 *  - `unavailable` — we could **not determine** identity: `/auth/me` failed for a reason that
 *    is not "not signed in" (a 5xx, a network error, a timeout). This is the state AUTH-06
 *    exists for. Collapsing it into `guest` — which the old shape did — renders an outage as a
 *    confident sign-out: it hides the user's own menu, offers "Log in" as if the session were
 *    gone, and bounces protected routes to `/login`. The honest answer is "we don't know yet".
 */
export type Session =
  | { status: "authenticated"; user: UserProfile; needsOnboarding: boolean }
  | { status: "guest" }
  | { status: "rejected" }
  | { status: "unavailable" };

/** The viewer's profile, or `null` when there is none to show — guest and unavailable alike. */
export function sessionViewer(session: Session): UserProfile | null {
  return session.status === "authenticated" ? session.user : null;
}

/** Cache-scoping principal: the viewer id, or `"anon"` when there is no known viewer. */
export function sessionPrincipal(session: Session): string {
  return sessionViewer(session)?.id ?? "anon";
}

const SessionContext = React.createContext<Session>({ status: "guest" });

/**
 * Holds the session snapshot and owns the one place a principal change is reconciled.
 *
 * Split by responsibility: the first two effects *learn* that this tab's snapshot may be
 * stale — by different mechanisms, because one cannot cover the other — and the last
 * *reacts* to whichever principal the server turns out to name. Keeping them apart is what
 * lets a cross-tab sign-in, a bfcache restore, and an in-tab sign-in converge on a single
 * cache-clearing path instead of three that can drift.
 */
export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const principal = sessionPrincipal(session);
  const previousPrincipal = React.useRef(principal);

  /**
   * Ask the one authority that can read an httpOnly cookie who this tab is now. Re-running
   * the layout re-runs `getSession()`, which is the same path that produced the current
   * snapshot — so identity is concluded in exactly one place, never inferred from a signal.
   */
  const reDeriveSession = React.useCallback(() => router.refresh(), [router]);

  /** Another tab signed in or out, so the shared cookies this tab renders from moved. */
  React.useEffect(() => subscribeSessionChanged(reDeriveSession), [reDeriveSession]);

  /**
   * This tab's own authenticated request just 401'd (handoff): the session expired under it. Re-
   * derive so the layout re-runs `getSession()` — which now returns `rejected` — and the header,
   * protected routes, and principal-scoped cache all follow, instead of the tab rendering a live
   * viewer whose session is already dead.
   */
  React.useEffect(() => subscribeSessionExpired(reDeriveSession), [reDeriveSession]);

  /**
   * Restored from the back/forward cache, where the broadcast above could not reach: a
   * bfcache'd document is not "fully active", so the spec drops it from the destination set
   * and never replays on restore. Without this, pressing Back into a tab that was open
   * before signing in elsewhere shows the previous viewer indefinitely — and nothing else
   * would catch it, since this app turns `refetchOnWindowFocus` off.
   */
  React.useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) reDeriveSession();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [reDeriveSession]);

  React.useEffect(() => {
    const previous = previousPrincipal.current;
    if (previous === principal) return;
    previousPrincipal.current = principal;
    const ownedByPrevious = (key: readonly unknown[]) => key.includes(previous);
    void queryClient.cancelQueries({ predicate: (query) => ownedByPrevious(query.queryKey) });
    queryClient.removeQueries({ predicate: (query) => ownedByPrevious(query.queryKey) });
    queryClient.getMutationCache().clear();
  }, [principal, queryClient]);

  /**
   * Keyed on the principal, so a change in *who this tab is* remounts the tree rather than
   * re-rendering it. Two things depend on that, and neither is optional:
   *
   *  - `useComposedPrincipal()` freezes at mount. Without a remount it would keep declaring
   *    the previous principal forever, and an ordinary sign-out/sign-in in this same tab
   *    would then 409 every mutation until a hard reload.
   *  - `router.refresh()` preserves client state by design — which is exactly wrong here.
   *    A half-typed form composed under A would otherwise survive the refresh and sit there
   *    with B's identity attached, which is the stale-write this whole mechanism exists to
   *    stop. Remounting discards it. Losing in-progress input is the intended outcome when
   *    the person at the keyboard is no longer who the form was for.
   */
  return (
    <SessionContext.Provider value={session}>
      <React.Fragment key={principal}>{children}</React.Fragment>
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  return React.useContext(SessionContext);
}

/**
 * The viewer's profile, or `null` when there is none. Most UI only needs "is there a viewer";
 * the guest-vs-unavailable distinction matters to just the header (what to offer) and the
 * protected routes (redirect vs error), which read the full {@link useSession} instead.
 */
export function useViewer(): UserProfile | null {
  return sessionViewer(useSession());
}

/** The current principal id for cache scoping — the viewer id, or `"anon"`. */
export function usePrincipal(): string {
  return sessionPrincipal(useSession());
}

/**
 * The principal this component was composed under, for `X-LinkedOut-Principal` on mutations.
 *
 * Freezing is the mechanism: the principal is captured at mount and never follows the
 * context afterwards. Reading `usePrincipal()` at submit time instead would look identical
 * and be useless — a cross-tab sign-in refreshes this tree, so the live value would already
 * have caught up to the new session and every stale write would sail through. The value must
 * describe the render the user actually interacted with, which is a fact only mount-time
 * knows. `SessionProvider` remounts on principal change, so a frozen value is never stale
 * for a tree that is still on screen.
 *
 * `useState`, not `useRef`: the initialiser runs once and the value is then ignored on every
 * later render, which is exactly the freeze — and unlike reading `ref.current` during
 * render, it is something React actually guarantees.
 *
 * The one place a `ComposedPrincipal` is minted, hence the one cast — and it is minted **only
 * from a real authenticated viewer id**, never from the `"anon"` cache-scoping placeholder.
 * Returns `null` for every non-authenticated session (guest, rejected, unavailable), because a
 * guest has no principal to compose a mutation under. Guests do not mutate; if one somehow
 * reaches a mutation, `null` makes it a caught error at the call site instead of an
 * `X-LinkedOut-Principal: anon` the API would 409 anyway.
 */
export function useComposedPrincipal(): ComposedPrincipal | null {
  const session = useSession();
  const [composedAs] = React.useState(() =>
    session.status === "authenticated" ? (session.user.id as ComposedPrincipal) : null,
  );
  return composedAs;
}

/**
 * Narrow a possibly-`null` composed principal at a mutation call site. Throws when absent — an
 * authenticated-only action was reached without an authenticated principal, which the UI should
 * have prevented; failing loudly beats sending a meaningless one.
 */
export function assertComposedPrincipal(
  principal: ComposedPrincipal | null,
): ComposedPrincipal {
  if (principal === null) {
    throw new Error("This action requires you to be signed in.");
  }
  return principal;
}
