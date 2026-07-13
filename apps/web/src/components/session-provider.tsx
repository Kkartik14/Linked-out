"use client";

import * as React from "react";
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
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  return React.useContext(SessionContext);
}

/** The current principal id for cache scoping — the user id, or `"anon"` when logged out. */
export function usePrincipal(): string {
  return useSession().user?.id ?? "anon";
}
