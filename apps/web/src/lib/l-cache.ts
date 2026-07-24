import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { ReactionResult } from "@linkedout/contracts";

import { queryKeys } from "@/lib/query-keys";

function isSharedLList(key: QueryKey, principal: string): boolean {
  if (key[1] !== principal) return false;
  if (key[0] === "feed" || key[0] === "feed-sidebar" || key[0] === "saved") return true;
  return key[0] === "search" && key[3] === "ls";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replace the reaction projection on an L wherever it is nested in a retained read model. */
function patchReactionProjection(
  value: unknown,
  lId: string,
  result: ReactionResult,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const patched = patchReactionProjection(item, lId, result);
      if (patched !== item) changed = true;
      return patched;
    });
    return changed ? next : value;
  }
  if (!isRecord(value)) return value;

  if (
    value.id === lId &&
    isRecord(value.reactions) &&
    isRecord(value.viewer) &&
    Array.isArray(value.viewer.reactions)
  ) {
    return {
      ...value,
      reactions: result.reactions,
      viewer: { ...value.viewer, reactions: result.viewer.reactions },
    };
  }

  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const patched = patchReactionProjection(child, lId, result);
    if (patched !== child) changed = true;
    next[key] = patched;
  }
  return changed ? next : value;
}

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
    if (isSharedLList(key, principal)) return true;
    if (key[1] !== principal) return false;
    if (key[0] === "user-ls") return key[2] === authorUsername;
    if (key[0] === "profiles") return key[2] === authorUsername;
    return false;
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

/**
 * Mark every retained L list stale after a reaction or comment changes its embedded card and may
 * change backend-owned ranking. The currently open surface keeps its optimistic/canonical state;
 * lists reconcile when revisited instead of reordering under the reader.
 */
export function reconcileLEngagement({
  queryClient,
  principal,
  savedChanged = false,
}: {
  queryClient: QueryClient;
  principal: string;
  savedChanged?: boolean;
}): Promise<void> {
  const staleLists = queryClient.invalidateQueries({
    predicate: (query) =>
      isSharedLList(query.queryKey, principal) ||
      (query.queryKey[0] === "user-ls" && query.queryKey[1] === principal),
    refetchType: "none",
  });
  if (!savedChanged) return staleLists;
  return Promise.all([
    staleLists,
    queryClient.refetchQueries({
      queryKey: queryKeys.saved.all(principal),
      exact: true,
      type: "active",
    }),
  ]).then(() => undefined);
}

/**
 * Store the API's authoritative reaction result in both the canonical per-L cache and every
 * retained card projection before marking ranking-owned lists stale. This prevents an old list
 * card from overwriting the mutation result when it remounts, so a later server snapshot can be
 * accepted without relying on cache-write-count freshness heuristics.
 */
export function reconcileReactionResult({
  queryClient,
  principal,
  lId,
  result,
  savedChanged = false,
}: {
  queryClient: QueryClient;
  principal: string;
  lId: string;
  result: ReactionResult;
  savedChanged?: boolean;
}): Promise<void> {
  queryClient.setQueryData(queryKeys.ls.reactions(principal, lId), result);
  queryClient.setQueriesData(
    {
      predicate: (query) =>
        isSharedLList(query.queryKey, principal) ||
        (query.queryKey[0] === "user-ls" && query.queryKey[1] === principal),
    },
    (data) => patchReactionProjection(data, lId, result),
  );

  return reconcileLEngagement({ queryClient, principal, savedChanged });
}
