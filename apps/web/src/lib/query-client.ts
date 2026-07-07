import { QueryClient, isServer } from "@tanstack/react-query";
import { isApiError } from "@/lib/api";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000, // 1 min — feeds/profiles don't need to refetch constantly
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Don't retry auth/permission/not-found errors — only transient ones.
          if (isApiError(error) && error.status < 500 && error.status !== 429) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

/**
 * One client per request on the server; a persistent singleton in the browser
 * (so navigations reuse the cache). Standard TanStack Query + App Router setup.
 */
export function getQueryClient(): QueryClient {
  if (isServer) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
