import { describe, expect, it } from "vitest";

import { queryKeys } from "@/lib/query-keys";

describe("notification query keys (FRONTEND-01)", () => {
  it("gives the finite preview and the infinite page distinct keys", () => {
    expect(queryKeys.notifications.preview("u1")).not.toEqual(
      queryKeys.notifications.infinite("u1"),
    );
  });

  it("scopes every key by principal", () => {
    expect(queryKeys.feed.infinite("u1", "global", "latest", null)).not.toEqual(
      queryKeys.feed.infinite("u2", "global", "latest", null),
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
