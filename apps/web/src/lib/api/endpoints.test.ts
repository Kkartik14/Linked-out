import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreateLInput } from "@linkedout/contracts";

import { apiFetch } from "./client";
import {
  createL,
  getFeed,
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
    void getFeed({ sort: "helpful", filter: "startups", limit: 10 });

    expect(apiFetch).toHaveBeenCalledWith("/feed?sort=helpful&filter=startups&limit=10");
  });

  it("uses the following feed path when requested", () => {
    void getFeed({ scope: "following", cursor: "abc", limit: 5 });

    expect(apiFetch).toHaveBeenCalledWith("/feed/following?cursor=abc&limit=5");
  });

  it("sends create L writes as POST JSON", () => {
    const body: CreateLInput = {
      title: "Rejected after the final round",
      story: "I wrote down the lesson while it was fresh.",
      type: "L",
      category: "INTERVIEWS",
      company: "Google",
      tags: ["interviews"],
      eventDate: null,
      visibility: "PUBLIC",
      isAnonymous: false,
    };

    void createL(body);

    expect(apiFetch).toHaveBeenCalledWith("/ls", {
      method: "POST",
      body: JSON.stringify(body),
    });
  });

  it("builds saved, notifications, and search URLs with encoded filters", () => {
    void getSaved("cursor value", 2);
    void getNotifications(undefined, 3);
    void searchLs("final round", "interviews", "next", 4);
    void searchUsers("Kartik Gupta", "users-next", 5);

    expect(apiFetch).toHaveBeenNthCalledWith(1, "/me/saved?cursor=cursor+value&limit=2");
    expect(apiFetch).toHaveBeenNthCalledWith(2, "/notifications?limit=3");
    expect(apiFetch).toHaveBeenNthCalledWith(
      3,
      "/search?q=final+round&type=ls&filter=interviews&cursor=next&limit=4",
    );
    expect(apiFetch).toHaveBeenNthCalledWith(
      4,
      "/search?q=Kartik+Gupta&type=users&cursor=users-next&limit=5",
    );
  });

  it("creates safe OAuth URLs and rejects open redirects", () => {
    expect(oauthLoginUrl("google", "/new?draft=1")).toContain(
      "/auth/google?returnTo=%2Fnew%3Fdraft%3D1",
    );

    expect(() => oauthLoginUrl("github", "https://evil.example")).toThrow(
      /safe relative path/,
    );
    expect(() => oauthLoginUrl("github", "//evil.example")).toThrow(/safe relative path/);
    expect(() => oauthLoginUrl("github", "/\\evil")).toThrow(/safe relative path/);
  });
});
