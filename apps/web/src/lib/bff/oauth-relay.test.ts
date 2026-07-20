import { describe, expect, it } from "vitest";

import { oauthStateCookieForUpstream } from "./oauth-relay";

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
