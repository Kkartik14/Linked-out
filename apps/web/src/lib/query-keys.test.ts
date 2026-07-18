import { describe, expect, it } from "vitest";

import { queryKeys } from "@/lib/query-keys";

describe("notification query keys (FRONTEND-01)", () => {
  it("gives the finite preview and the infinite page distinct keys", () => {
    expect(queryKeys.notifications.preview("u1")).not.toEqual(
      queryKeys.notifications.infinite("u1"),
    );
  });

  it("scopes every key by principal", () => {
    expect(queryKeys.feed.infinite("u1", "global", "latest")).not.toEqual(
      queryKeys.feed.infinite("u2", "global", "latest"),
    );
    expect(queryKeys.notifications.preview("u1")).not.toEqual(
      queryKeys.notifications.preview("u2"),
    );
    expect(queryKeys.notifications.infinite("u1")).not.toEqual(
      queryKeys.notifications.infinite("u2"),
    );
    expect(queryKeys.notifications.unreadCount("u1")).not.toEqual(
      queryKeys.notifications.unreadCount("u2"),
    );
  });

  it("roots preview, infinite, and unread-count under all(principal) so one invalidate covers them", () => {
    const root = queryKeys.notifications.all("u1");
    for (const key of [
      queryKeys.notifications.preview("u1"),
      queryKeys.notifications.infinite("u1"),
      queryKeys.notifications.unreadCount("u1"),
    ]) {
      expect(key.slice(0, root.length)).toEqual([...root]);
    }
  });
});

describe("public API feed and search keys", () => {
  it("no longer varies the feed key by a removed category filter", () => {
    // Public API feeds have no `filter`; scope and sort are the only axes left.
    expect(queryKeys.feed.infinite("u1", "global", "latest")).toEqual([
      "feed",
      "u1",
      "global",
      "latest",
    ]);
    expect(queryKeys.feed.infinite("u1", "global", "latest")).not.toEqual(
      queryKeys.feed.infinite("u1", "following", "latest"),
    );
    expect(queryKeys.feed.infinite("u1", "global", "latest")).not.toEqual(
      queryKeys.feed.infinite("u1", "global", "popular"),
    );
  });

  it("keys L search by query alone, since relevance is the only ranking", () => {
    expect(queryKeys.search.ls("u1", "burnout")).toEqual(["search", "u1", "ls", "burnout"]);
    expect(queryKeys.search.ls("u1", "burnout")).not.toEqual(queryKeys.search.ls("u1", "layoff"));
  });
});

describe("feed sidebar key", () => {
  it("scopes the sidebar per principal, because the response carries viewer state", () => {
    expect(queryKeys.feedSidebar.detail("u1")).not.toEqual(queryKeys.feedSidebar.detail("u2"));
    expect(queryKeys.feedSidebar.detail("anon")).toEqual(["feed-sidebar", "anon"]);
  });
});
