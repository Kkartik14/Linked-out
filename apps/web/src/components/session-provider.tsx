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
 * Two effects, deliberately split by responsibility: the first *learns* that this tab's
 * snapshot is stale, the second *reacts* to the principal it turns out to be. Keeping them
 * apart is what lets a cross-tab sign-in and an in-tab sign-in converge on a single
 * cache-clearing path instead of two that can drift.
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
   * Another tab changed the shared cookies. This tab cannot read them, so it re-renders the
   * server component that produced its snapshot and lets the server answer. If the principal
   * actually changed, the new prop lands and the effect below does the rest; if it did not,
   * `router.refresh()` is the cost of finding out. The signal never asserts an identity, so
   * this is the only path that can conclude one (see `lib/session-channel`).
   */
  React.useEffect(() => subscribeSessionChanged(() => router.refresh()), [router]);

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
