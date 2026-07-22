import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateLInput } from "@linkedout/contracts";

import type { ComposedPrincipal } from "@/lib/principal";
import { apiFetch } from "./client";
import {
  addReaction,
  createL,
  getComments,
  getFeed,
  getFeedSidebar,
  getMeta,
  getNotifications,
  getReplies,
  getSaved,
  logout,
  oauthLoginUrl,
  searchLs,
  searchUsers,
} from "./endpoints";

/**
 * Only tests mint one of these outside `useComposedPrincipal`. Production code cannot: the
 * brand is what stops a caller reaching for the live principal, which would look identical
 * and quietly defeat the whole check.
 */
const COMPOSED = "01ARZ3NDEKTSV4RRFFQ69G5FAV" as string as ComposedPrincipal;

vi.mock("./client", () => ({
  apiFetch: vi.fn(),
}));

describe("API endpoint helpers", () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it("builds global feed query strings without empty params", () => {
    void getFeed({ sort: "popular", limit: 10 });

    expect(apiFetch).toHaveBeenCalledWith("/feed?sort=popular&limit=10");
  });

  it("uses the following feed path when requested", () => {
    void getFeed({ scope: "following", cursor: "abc", limit: 5 });

    expect(apiFetch).toHaveBeenCalledWith("/feed/following?cursor=abc&limit=5");
  });

  it("fetches enum metadata through a contract-versioned shared cache key", () => {
    void getMeta();

    expect(apiFetch).toHaveBeenCalledWith("/meta/enums?v=1.1.4", {
      cache: "force-cache",
      credentials: "omit",
      next: { revalidate: 86_400 },
    });
  });

  it("sends create L writes as POST JSON", () => {
    // The public API create body cannot express the removed category/company/tags/eventDate fields.
    const body: CreateLInput = {
      title: "Rejected after the final round",
      story: "I wrote down the lesson while it was fresh.",
      type: "L",
      visibility: "PUBLIC",
      isAnonymous: false,
    };

    void createL(COMPOSED, body);

    expect(apiFetch).toHaveBeenCalledWith("/ls", {
      method: "POST",
      body: JSON.stringify(body),
      principal: COMPOSED,
    });
  });

  it("declares the composing principal on every authenticated mutation", () => {
    // A missing declaration is a 409, not an exemption, so this is the difference between a
    // working write and a dead one. Asserted across three shapes — body, no body, and no
    // arguments at all — because those are the three ways an endpoint could forget it.
    void createL(COMPOSED, { title: "t", story: "s" });
    void addReaction(COMPOSED, "01HZY", "HELPFUL");
    void logout(COMPOSED);

    for (const call of vi.mocked(apiFetch).mock.calls) {
      expect(call[1]).toMatchObject({ principal: COMPOSED });
    }
  });

  it("never declares a principal on a read", () => {
    // The API only compares the declaration on unsafe methods, but sending render-time
    // identity on reads would put a user id on cacheable requests for nothing.
    void getFeed({ sort: "popular" });
    void getSaved();
    void getFeedSidebar();

    for (const call of vi.mocked(apiFetch).mock.calls) {
      expect(call[1] ?? {}).not.toHaveProperty("principal");
    }
  });

  it("builds saved, notifications, and search URLs without a category filter", () => {
    void getSaved("cursor value", 2);
    void getNotifications(undefined, 3);
    void searchLs("final round", "next", 4);
    void searchUsers("Kartik Gupta", "users-next", 5);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/me/saved?cursor=cursor+value&limit=2");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/notifications?limit=3");
    expect(apiFetch).toHaveBeenNthCalledWith(3, "/search?q=final+round&type=ls&cursor=next&limit=4");
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/search?q=Kartik+Gupta&type=users&cursor=users-next&limit=5",
    );
  });

  it("forwards cancellation to live search requests", () => {
    const controller = new AbortController();
    void searchLs("r", undefined, 1, { signal: controller.signal });
    void searchUsers("r", undefined, 3, { signal: controller.signal });

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/search?q=r&type=ls&limit=1", {
      signal: controller.signal,
    });
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/search?q=r&type=users&limit=3", {
      signal: controller.signal,
    });
  });

  it("forwards the cursor for comment and reply pagination", () => {
    // A dropped cursor here still returns page 1, so only an assertion on the URL catches
    // it — every page past the first would silently repeat the first.
    void getComments("01HZY", "comments-next", 6);
    void getComments("01HZY");
    void getReplies("01HZZ", "replies-next", 7);
    void getReplies("01HZZ");

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      "/ls/01HZY/comments?cursor=comments-next&limit=6",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/ls/01HZY/comments");
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/comments/01HZZ/replies?cursor=replies-next&limit=7",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(4, "/comments/01HZZ/replies");
  });

  it("creates safe OAuth URLs and rejects open redirects", () => {
    expect(oauthLoginUrl("google", "/new?draft=1")).toContain(
      "/auth/google?returnTo=%2Fnew%3Fdraft%3D1",
    );

    expect(() => oauthLoginUrl("github", "https://evil.example")).toThrow(/safe relative path/);
    expect(() => oauthLoginUrl("github", "//evil.example")).toThrow(/safe relative path/);
    expect(() => oauthLoginUrl("github", "/\\evil")).toThrow(/safe relative path/);
  });

  it("fetches the discovery rails from the one aggregate route, on a short budget", () => {
    void getFeedSidebar();

    // The rails fail independently of the centre feed (public contract §2), which is only true
    // if they actually fail: the tighter timeout is what stops a slow backend holding the
    // feed page open for something the page is allowed to drop.
    expect(apiFetch).toHaveBeenCalledWith("/feed/sidebar", { timeoutMs: 3_000 });
  });
});
