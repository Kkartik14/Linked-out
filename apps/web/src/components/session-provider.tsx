"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@linkedout/contracts/v2";

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

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return React.useContext(SessionContext);
}

/** The current principal id for cache scoping — the user id, or `"anon"` when logged out. */
export function usePrincipal(): string {
  return useSession().user?.id ?? "anon";
}
