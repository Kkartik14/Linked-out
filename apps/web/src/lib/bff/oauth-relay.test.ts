import { describe, expect, it } from "vitest";

import { oauthSetCookieForBrowser, oauthStateCookieForUpstream } from "./oauth-relay";

describe("oauthStateCookieForUpstream", () => {
  it("forwards only the OAuth state cookie on provider callbacks", () => {
    expect(
      oauthStateCookieForUpstream("/v1/auth/google/callback", "nonce-value"),
    ).toBe("lo_oauth_state=nonce-value");
    expect(
      oauthStateCookieForUpstream("/v1/auth/github/callback", "nonce-value"),
    ).toBe("lo_oauth_state=nonce-value");
  });

  it("forwards no browser cookie to OAuth starts or ordinary API routes", () => {
    expect(oauthStateCookieForUpstream("/v1/auth/google", "nonce-value")).toBeNull();
    expect(oauthStateCookieForUpstream("/v1/ls", "nonce-value")).toBeNull();
    expect(oauthStateCookieForUpstream("/v1/auth/google/callback", undefined)).toBeNull();
  });
});

describe("oauthSetCookieForBrowser", () => {
  it("allows the OAuth state cookie to be set and cleared on OAuth routes", () => {
    expect(
      oauthSetCookieForBrowser(
        "/v1/auth/google",
        "lo_oauth_state=nonce; Path=/v1/auth; HttpOnly; SameSite=Lax",
      ),
    ).toContain("lo_oauth_state=nonce");
    expect(
      oauthSetCookieForBrowser(
        "/v1/auth/github/callback",
        "lo_oauth_state=; Path=/v1/auth; Max-Age=0",
      ),
    ).toContain("Max-Age=0");
  });

  it.each([
    ["/v1/ls", "lo_oauth_state=nonce; Path=/v1/auth"],
    ["/v1/auth/google", "lo_access=legacy; HttpOnly"],
    ["/v1/auth/google/callback", "lo_refresh=legacy; HttpOnly"],
    ["/v1/auth/github", "analytics=private"],
  ])("rejects %s Set-Cookie %s", (path, cookie) => {
    expect(oauthSetCookieForBrowser(path, cookie)).toBeNull();
  });
});
