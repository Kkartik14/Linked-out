import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateLInput } from "@linkedout/contracts/v2";

import { apiFetch } from "./client";
import {
  createL,
  getFeed,
  getFeedSidebar,
  getMeta,
  getNotifications,
  getSaved,
  oauthLoginUrl,
  searchLs,
  searchUsers,
} from "./endpoints";

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

  it("fetches principal-independent enum metadata through Next's shared revalidation cache", () => {
    void getMeta();

    expect(apiFetch).toHaveBeenCalledWith("/meta/enums", {
      cache: "force-cache",
      credentials: "omit",
      next: { revalidate: 86_400 },
    });
  });

  it("sends create L writes as POST JSON", () => {
    // v2 create body: the removed category/company/tags/eventDate fields cannot be expressed.
    const body: CreateLInput = {
      title: "Rejected after the final round",
      story: "I wrote down the lesson while it was fresh.",
      type: "L",
      visibility: "PUBLIC",
      isAnonymous: false,
    };

    void createL(body);

    expect(apiFetch).toHaveBeenCalledWith("/ls", {
      method: "POST",
      body: JSON.stringify(body),
    });
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

  it("creates safe OAuth URLs and rejects open redirects", () => {
    expect(oauthLoginUrl("google", "/new?draft=1")).toContain(
      "/auth/google?returnTo=%2Fnew%3Fdraft%3D1",
    );

    expect(() => oauthLoginUrl("github", "https://evil.example")).toThrow(/safe relative path/);
    expect(() => oauthLoginUrl("github", "//evil.example")).toThrow(/safe relative path/);
    expect(() => oauthLoginUrl("github", "/\\evil")).toThrow(/safe relative path/);
  });

  it("fetches the discovery rails from the one aggregate route", () => {
    void getFeedSidebar();

    expect(apiFetch).toHaveBeenCalledWith("/feed/sidebar");
  });
});
