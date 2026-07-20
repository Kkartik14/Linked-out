// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";

import { publicWebOrigin } from "./public-origin";

afterEach(() => vi.unstubAllEnvs());

describe("publicWebOrigin", () => {
  it("normalizes a configured origin", () => {
    vi.stubEnv("WEB_URL", "https://linkedout.example/");
    expect(publicWebOrigin()).toBe("https://linkedout.example");
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
