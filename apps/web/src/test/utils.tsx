import * as React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  PathnameContext,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { UserProfile } from "@linkedout/contracts";

import { DEFAULT_META } from "@/lib/meta-fallback";
import { MetaProvider } from "@/components/meta-provider";
import { SessionProvider, type Session } from "@/components/session-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export const mockUser: UserProfile = {
  // A real ULID: `id` is `ulidSchema` on the wire, so a placeholder like "u_kartik" fails
  // any test that validates this user against the contract.
  id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  username: "kartik",
  name: "Kartik Gupta",
  image: null,
  bio: null,
  status: "BUILDING",
  reputation: {
    storiesShared: 0,
    lsShared: 0,
  },
  counts: { followers: 0, following: 0 },
  viewer: { isFollowing: false, isSelf: true },
  createdAt: "2026-01-01T00:00:00.000Z",
};

const mockRouter: AppRouterInstance = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch() {},
};

export function renderWithProviders(
  ui: React.ReactElement,
  opts?: {
    session?: Session;
    router?: Partial<AppRouterInstance>;
    pathname?: string;
    searchParams?: URLSearchParams;
    queryClient?: QueryClient;
  } & Omit<RenderOptions, "wrapper">,
) {
  const {
    session,
    router,
    pathname = "/",
    searchParams,
    queryClient: providedQueryClient,
    ...rest
  } = opts ?? {};
  const queryClient =
    providedQueryClient ??
    new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const value: Session = session ?? { status: "guest" };
  const routerValue = { ...mockRouter, ...router };

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <AppRouterContext.Provider value={routerValue}>
        <PathnameContext.Provider value={pathname}>
          <SearchParamsContext.Provider value={searchParams ?? new URLSearchParams()}>
            <QueryClientProvider client={queryClient}>
              <SessionProvider session={value}>
                <MetaProvider meta={DEFAULT_META}>
                  <TooltipProvider>{children}</TooltipProvider>
                </MetaProvider>
              </SessionProvider>
            </QueryClientProvider>
          </SearchParamsContext.Provider>
        </PathnameContext.Provider>
      </AppRouterContext.Provider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient };
}
