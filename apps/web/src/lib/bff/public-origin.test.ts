// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { publicWebOrigin } from "./public-origin";

afterEach(() => vi.unstubAllEnvs());

describe("publicWebOrigin", () => {
  it("normalizes a configured origin", () => {
    vi.stubEnv("WEB_URL", "https://linkedout.example/");
    expect(publicWebOrigin()).toBe("https://linkedout.example");
  });

  it("uses the current branch URL for a Vercel preview", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_BRANCH_URL", "linked-out-fe-git-feature-team.vercel.app");
    vi.stubEnv("WEB_URL", "https://linked-out-fe.vercel.app");
    expect(publicWebOrigin()).toBe("https://linked-out-fe-git-feature-team.vercel.app");
  });

  it("falls back to the commit URL when a branch URL is unavailable", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_URL", "linked-out-fe-commit-team.vercel.app");
    vi.stubEnv("WEB_URL", "https://linked-out-fe.vercel.app");
    expect(publicWebOrigin()).toBe("https://linked-out-fe-commit-team.vercel.app");
  });

  it.each([
    "https://user:secret@linkedout.example",
    "https://linkedout.example/app",
    "https://linkedout.example?tenant=other",
    "file:///tmp/linkedout",
  ])("rejects a non-origin WEB_URL: %s", (value) => {
    vi.stubEnv("WEB_URL", value);
    expect(() => publicWebOrigin()).toThrow(/HTTP\(S\) origin/);
  });

  it("rejects plaintext production traffic outside loopback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("WEB_URL", "http://linkedout.example");
    expect(() => publicWebOrigin()).toThrow(/HTTPS/);
  });
});
