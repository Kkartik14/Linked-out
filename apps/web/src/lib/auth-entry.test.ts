import { OAUTH_FAILURES } from "@linkedout/contracts";
import { describe, expect, it } from "vitest";

import { oauthErrorMessage, safeReturnTo } from "@/lib/auth-entry";

describe("oauthErrorMessage", () => {
  it("renders nothing when there is no error", () => {
    expect(oauthErrorMessage(null)).toBeNull();
    expect(oauthErrorMessage(undefined)).toBeNull();
    expect(oauthErrorMessage("")).toBeNull();
  });

  it.each(Object.keys(OAUTH_FAILURES) as Array<keyof typeof OAUTH_FAILURES>)(
    "renders the contract's own copy for %s",
    (code) => {
      // Compared against the contract rather than a literal: if the backend rewords a
      // failure, this follows it instead of pinning copy the frontend does not own.
      expect(oauthErrorMessage(code)).toBe(OAUTH_FAILURES[code].message);
    },
  );

  it("falls back for a code the contract has no words for", () => {
    expect(oauthErrorMessage("provider_exploded")).toBe("Sign-in failed. Please try again.");
  });

  it("never renders text supplied by whoever crafted the URL", () => {
    // The redirect carries a `message` alongside `error`, and the query is attacker-supplied:
    // a link to the real /auth/callback with a chosen message would otherwise have our own
    // sign-in page phish on the attacker's behalf. Copy is keyed off the validated code, so
    // an injected code yields our fallback and an injected message has no way in at all.
    const phish = "Your account is locked. Call 1-800-555-0100 to restore access.";
    expect(oauthErrorMessage(phish)).toBe("Sign-in failed. Please try again.");
    expect(oauthErrorMessage("access_denied")).not.toContain("1-800");
    expect(Object.values(OAUTH_FAILURES).map((f) => f.message)).not.toContain(phish);
  });
});

describe("safeReturnTo", () => {
  it("keeps a relative path", () => {
    expect(safeReturnTo("/settings")).toBe("/settings");
  });

  it.each(["https://evil.example/steal", "//evil.example", null, undefined, ""])(
    "falls back to / rather than opening a redirect for %s",
    (value) => {
      expect(safeReturnTo(value)).toBe("/");
    },
  );
});
