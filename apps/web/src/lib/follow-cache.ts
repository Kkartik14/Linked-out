import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/**
 * A follow attempt can change relationship counts, feed membership, and access to the target's
 * followers-only Ls. Every mutation entry point calls this policy after settling so even an
 * ambiguous transport failure reconciles every read model that may depend on the edge.
 *
 * `refetchType: "none"` is deliberate. The surface that performed the write owns its optimistic
 * state, including the directory's reversible Follow Back row. Broad dependent queries are marked
 * stale for their next mount. Active Following feeds, target L tabs, and the sidebar refetch now
 * because their currently visible membership or aggregate changed.
 */
export async function reconcileFollowGraph({
  queryClient,
  principal,
  viewerUsername,
  targetUsername,
}: {
  queryClient: QueryClient;
  principal: string;
  viewerUsername: string;
  targetUsername: string;
}): Promise<void> {
  const exactKeys: QueryKey[] = [
    queryKeys.profiles.detail(principal, viewerUsername),
    queryKeys.users.following(principal, viewerUsername),
    queryKeys.profiles.detail(principal, targetUsername),
    queryKeys.users.followers(principal, targetUsername),
    queryKeys.saved.all(principal),
    queryKeys.feedSidebar.detail(principal),
  ];

  const isExactKey = (candidate: QueryKey) =>
    exactKeys.some(
      (expected) =>
        candidate.length === expected.length &&
        candidate.every((part, index) => part === expected[index]),
    );
  const isAffected = (key: QueryKey) => {
    if (key[1] !== principal) return false;
    if (isExactKey(key)) return true;
    if (key[0] === "feed") return true;
    if (key[0] === "user-followers" || key[0] === "user-following") return true;
    if (key[0] === "user-ls" && key[2] === targetUsername) return true;
    return key[0] === "search" && key[3] === "ls";
  };

  await queryClient.invalidateQueries({
    predicate: (query) => isAffected(query.queryKey),
    refetchType: "none",
  });

  await Promise.all([
    queryClient.refetchQueries({
      predicate: (query) =>
        query.queryKey[0] === "feed" &&
        query.queryKey[1] === principal &&
        query.queryKey[2] === "following",
      type: "active",
    }),
    queryClient.refetchQueries({
      queryKey: ["user-ls", principal, targetUsername],
      type: "active",
    }),
    queryClient.refetchQueries({
      queryKey: queryKeys.feedSidebar.detail(principal),
      exact: true,
      type: "active",
    }),
  ]);
}
