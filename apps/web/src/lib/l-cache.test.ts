import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { reconcileLEngagement, reconcileLWrite } from "@/lib/l-cache";
import { queryKeys } from "@/lib/query-keys";

describe("reconcileLWrite", () => {
  it("stales every cached list and profile affected by an author's L write", async () => {
    const queryClient = new QueryClient();
    const principal = "viewer-id";
    const authorUsername = "kartik";
    const affected: QueryKey[] = [
      queryKeys.feed.infinite(principal, "global", "latest"),
      queryKeys.feed.infinite(principal, "following", "popular"),
      queryKeys.users.ls(principal, authorUsername, "ALL"),
      queryKeys.users.ls(principal, authorUsername, "STORY"),
      queryKeys.saved.all(principal),
      queryKeys.search.preview.ls(principal, "rejection"),
      queryKeys.search.infinite.ls(principal, "rejection"),
      queryKeys.feedSidebar.detail(principal),
      queryKeys.profiles.detail(principal, authorUsername),
    ];
    const unaffected: QueryKey[] = [
      queryKeys.users.ls(principal, "another-author", "ALL"),
      queryKeys.search.preview.users(principal, "kartik"),
      queryKeys.notifications.all(principal),
      queryKeys.feed.infinite("another-viewer", "global", "latest"),
      queryKeys.profiles.detail("another-viewer", authorUsername),
    ];
    for (const key of [...affected, ...unaffected]) queryClient.setQueryData(key, { seeded: true });

    await reconcileLWrite({ queryClient, principal, authorUsername, lId: "l-1" });

    for (const key of affected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });

  it("drops canonical per-L state after deletion without touching another L", async () => {
    const queryClient = new QueryClient();
    const principal = "viewer-id";
    const deletedKeys = [
      queryKeys.ls.reactions(principal, "deleted-l"),
      queryKeys.ls.commentCount(principal, "deleted-l"),
      queryKeys.comments.list(principal, "deleted-l"),
    ];
    const retainedKey = queryKeys.ls.reactions(principal, "retained-l");
    for (const key of [...deletedKeys, retainedKey]) queryClient.setQueryData(key, { seeded: true });

    await reconcileLWrite({
      queryClient,
      principal,
      authorUsername: "kartik",
      lId: "deleted-l",
      deleted: true,
    });

    for (const key of deletedKeys) expect(queryClient.getQueryState(key)).toBeUndefined();
    expect(queryClient.getQueryState(retainedKey)).toBeDefined();
  });
});

describe("reconcileLEngagement", () => {
  it("stales every retained L list so ranking and embedded cards refresh on their next mount", async () => {
    const queryClient = new QueryClient();
    const principal = "viewer-id";
    const affected: QueryKey[] = [
      queryKeys.feed.infinite(principal, "global", "latest"),
      queryKeys.feed.infinite(principal, "global", "popular"),
      queryKeys.feed.infinite(principal, "following", "helpful"),
      queryKeys.users.ls(principal, "kartik", "ALL"),
      queryKeys.users.ls(principal, "nadia", "STORY"),
      queryKeys.saved.all(principal),
      queryKeys.search.preview.ls(principal, "rejection"),
      queryKeys.search.infinite.ls(principal, "rejection"),
      queryKeys.feedSidebar.detail(principal),
    ];
    const unaffected: QueryKey[] = [
      queryKeys.search.preview.users(principal, "kartik"),
      queryKeys.profiles.detail(principal, "kartik"),
      queryKeys.notifications.all(principal),
      queryKeys.feed.infinite("another-viewer", "global", "popular"),
    ];
    for (const key of [...affected, ...unaffected]) queryClient.setQueryData(key, { seeded: true });

    await reconcileLEngagement({ queryClient, principal });

    for (const key of affected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    for (const key of unaffected) {
      expect(queryClient.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(false);
    }
  });
});
