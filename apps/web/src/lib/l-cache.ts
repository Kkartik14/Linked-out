import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

/**
 * Reconcile every retained read model that embeds an L or derives author metrics from L writes.
 *
 * The API owns card projection, visibility, ranking, and story-preview truncation, so this module
 * marks those read models stale instead of recreating backend policy in the browser. The write
 * surfaces are separate routes; their next mount refetches without reshuffling a currently read
 * list under the user.
 */
export async function reconcileLWrite({
  queryClient,
  principal,
  authorUsername,
  lId,
  deleted = false,
}: {
  queryClient: QueryClient;
  principal: string;
  authorUsername: string;
  lId: string;
  deleted?: boolean;
}): Promise<void> {
  const isAffected = (key: QueryKey) => {
    if (key[1] !== principal) return false;
    if (key[0] === "feed" || key[0] === "feed-sidebar" || key[0] === "saved") return true;
    if (key[0] === "user-ls") return key[2] === authorUsername;
    if (key[0] === "profiles") return key[2] === authorUsername;
    return key[0] === "search" && key[3] === "ls";
  };

  await queryClient.invalidateQueries({
    predicate: (query) => isAffected(query.queryKey),
    refetchType: "none",
  });

  if (deleted) {
    const removed = [
      queryKeys.ls.reactions(principal, lId),
      queryKeys.ls.commentCount(principal, lId),
      queryKeys.comments.list(principal, lId),
    ] as const;
    await Promise.all(
      removed.map((queryKey) => queryClient.cancelQueries({ queryKey, exact: true })),
    );
    for (const queryKey of removed) queryClient.removeQueries({ queryKey, exact: true });
  }
}
