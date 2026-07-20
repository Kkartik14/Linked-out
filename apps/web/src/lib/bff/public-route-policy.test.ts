import { describe, expect, it } from "vitest";

import { isPrivateApiPath } from "./public-route-policy";

describe("isPrivateApiPath", () => {
  it.each([
    "/v1/health/private-api",
    "/v1/health/database",
    "/v1/health/session-authority",
    "/v1/auth/sessions/resolve",
    "/v1/auth/sessions/revoke",
    "/v1/auth/oauth/handoff/exchange",
  ])("keeps %s off the public BFF", (path) => {
    expect(isPrivateApiPath(path)).toBe(true);
  });

  it.each(["/v1/auth/me", "/v1/auth/google", "/v1/meta/enums", "/v1/ls"])(
    "allows the public route %s",
    (path) => expect(isPrivateApiPath(path)).toBe(false),
  );
});
