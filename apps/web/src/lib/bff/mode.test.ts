import { afterEach, describe, expect, it } from "vitest";

import { isHandoffMode, sessionMode } from "./mode";

const original = process.env.OAUTH_SESSION_MODE;

afterEach(() => {
  if (original === undefined) delete process.env.OAUTH_SESSION_MODE;
  else process.env.OAUTH_SESSION_MODE = original;
});

describe("sessionMode", () => {
  it("defaults to legacy when unset", () => {
    delete process.env.OAUTH_SESSION_MODE;
    expect(sessionMode()).toBe("legacy");
    expect(isHandoffMode()).toBe(false);
  });

  it("reads handoff when explicitly set", () => {
    process.env.OAUTH_SESSION_MODE = "handoff";
    expect(sessionMode()).toBe("handoff");
    expect(isHandoffMode()).toBe(true);
  });

  it("falls back to legacy for any unrecognised value", () => {
    // The fail-safe that keeps a typo or a partial rollout from exposing the handoff path.
    process.env.OAUTH_SESSION_MODE = "HANDOFF";
    expect(sessionMode()).toBe("legacy");
    process.env.OAUTH_SESSION_MODE = "";
    expect(sessionMode()).toBe("legacy");
  });
});
