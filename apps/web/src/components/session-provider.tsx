"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@linkedout/contracts/v2";

import type { ComposedPrincipal } from "@/lib/principal";
import { subscribeSessionChanged } from "@/lib/session-channel";

export interface Session {
  user: UserProfile | null;
  needsOnboarding: boolean;
}

const SessionContext = React.createContext<Session>({ user: null, needsOnboarding: false });

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
  const principal = session.user?.id ?? "anon";
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

/** The current principal id for cache scoping — the user id, or `"anon"` when logged out. */
export function usePrincipal(): string {
  return useSession().user?.id ?? "anon";
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
 * The one place a `ComposedPrincipal` is minted, hence the one cast: this is the only site
 * that can honestly claim the value means what the brand says it means.
 */
export function useComposedPrincipal(): ComposedPrincipal {
  const [composedAs] = React.useState(usePrincipal());
  return composedAs as ComposedPrincipal;
}
