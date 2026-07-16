"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@linkedout/contracts";

export interface Session {
  user: UserProfile | null;
  needsOnboarding: boolean;
}

const SessionContext = React.createContext<Session>({ user: null, needsOnboarding: false });

export function SessionProvider({
  session,
  children,
}: {
  session: Session;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const principal = session.user?.id ?? "anon";
  const previousPrincipal = React.useRef(principal);

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
