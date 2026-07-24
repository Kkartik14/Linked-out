import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { reconcileFollowGraph } from "@/lib/follow-cache";
import { queryKeys } from "@/lib/query-keys";

describe("reconcileFollowGraph", () => {
  it("stales every viewer read model whose membership or visibility changes with a follow edge", async () => {
    const queryClient = new QueryClient();
    const principal = "viewer-id";
    const viewerUsername = "viewer";
    const targetUsername = "target";
    const currentDirectoryKey = queryKeys.users.followers(principal, viewerUsername);
    const affected: QueryKey[] = [
      queryKeys.profiles.detail(principal, viewerUsername),
      queryKeys.profiles.detail(principal, targetUsername),
      queryKeys.users.following(principal, viewerUsername),
      queryKeys.users.followers(principal, targetUsername),
      queryKeys.users.followers(principal, "mutual-friend"),
      queryKeys.users.following(principal, "another-builder"),
      currentDirectoryKey,
      queryKeys.feed.infinite(principal, "global", "latest"),
      queryKeys.feed.infinite(principal, "following", "popular"),
      queryKeys.users.ls(principal, targetUsername, "ALL"),
      queryKeys.users.ls(principal, targetUsername, "STORY"),
      queryKeys.saved.all(principal),
      queryKeys.search.preview.ls(principal, "target"),
      queryKeys.search.infinite.ls(principal, "target"),
      queryKeys.feedSidebar.detail(principal),
    ];
    const unaffected: QueryKey[] = [
      queryKeys.users.ls(principal, "someone-else", "ALL"),
      queryKeys.search.preview.users(principal, "target"),
      queryKeys.notifications.all(principal),
      queryKeys.feed.infinite("another-viewer", "following", "latest"),
    ];

    for (const key of [...affected, ...unaffected]) queryClient.setQueryData(key, { seeded: true });

    await reconcileFollowGraph({
      queryClient,
      principal,
      viewerUsername,
      targetUsername,
      currentDirectoryKey,
    });

    for (const key of affected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });
});
