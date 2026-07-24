import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/**
 * A successful follow toggle changes two sides of the graph: who the viewer follows and who
 * follows the target. Every mutation entry point calls this policy so a previously visited route
 * cannot keep serving its pre-mutation profile or directory cache.
 *
 * `refetchType: "none"` is deliberate. The surface that performed the write owns its optimistic
 * state, including the directory's reversible Follow Back row. Marking dependent queries stale
 * makes the next mount reconcile with the API without changing the currently open surface.
 */
export async function markFollowGraphQueriesStale({
  queryClient,
  principal,
  viewerUsername,
  targetUsername,
  currentDirectoryKey,
}: {
  queryClient: QueryClient;
  principal: string;
  viewerUsername: string;
  targetUsername: string;
  currentDirectoryKey?: QueryKey;
}): Promise<void> {
  const affected: QueryKey[] = [
    queryKeys.profiles.detail(principal, viewerUsername),
    queryKeys.users.following(principal, viewerUsername),
    queryKeys.profiles.detail(principal, targetUsername),
    queryKeys.users.followers(principal, targetUsername),
  ];
  if (currentDirectoryKey) affected.push(currentDirectoryKey);

  await Promise.all(
    affected.map((queryKey) =>
      queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "none" }),
    ),
  );
}
