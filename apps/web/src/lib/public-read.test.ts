import { beforeEach, describe, expect, it, vi } from "vitest";

import { notFound, redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import { publicReadFailure, redirectIfCredentialRejected } from "@/lib/public-read";

/**
 * `redirect`/`notFound` work by throwing a framework signal, so the real ones would abort
 * every assertion after the call. Mock them as recording throwers: the tests can then assert
 * both *that* navigation happened and that control stopped there, the way it does in a
 * Server Component.
 */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT:${url}`);
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
  notFound: vi.fn(() => {
    throw new NotFoundSignal();
  }),
}));

const rejected = new ApiError(401, "UNAUTHENTICATED", "Credential rejected");
const missing = new ApiError(404, "L_NOT_FOUND", "Missing");
const broken = new ApiError(500, "INTERNAL", "Backend on fire");

const UNSAFE_RETURN_TO = [
  "https://evil.example",
  "//evil.example",
  "/\\evil",
  "relative-path",
  "",
];

beforeEach(() => {
  vi.mocked(redirect).mockClear();
  vi.mocked(notFound).mockClear();
});

describe("redirectIfCredentialRejected", () => {
  it("sends a rejected credential to login with the page as returnTo", () => {
    // The public API answers a presented-but-invalid credential with 401 even on an optional-auth
    // read (public contract §0), so a public page has to handle it.
    expect(() => redirectIfCredentialRejected(rejected, "/ls/01HZY")).toThrow(RedirectSignal);

    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fls%2F01HZY");
  });

  it("url-encodes a returnTo carrying a query string", () => {
    expect(() => redirectIfCredentialRejected(rejected, "/search?q=final round&type=ls")).toThrow(
      RedirectSignal,
    );

    expect(redirect).toHaveBeenCalledWith(
      "/login?returnTo=%2Fsearch%3Fq%3Dfinal%20round%26type%3Dls",
    );
  });

  it("falls back to / rather than honouring an unsafe returnTo", () => {
    // Same rule as `oauthLoginUrl` and the login/onboarding/auth-callback pages: a value
    // that reaches a redirect is validated, never passed through.
    for (const unsafe of UNSAFE_RETURN_TO) {
      vi.mocked(redirect).mockClear();

      expect(() => redirectIfCredentialRejected(rejected, unsafe)).toThrow(RedirectSignal);
      expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2F");
    }
  });

  it("does not redirect for any status other than 401", () => {
    // Pins the credential rule itself: a mutation widening 401 to another status, or
    // dropping the check, has to fail here.
    for (const err of [missing, broken, new ApiError(403, "FORBIDDEN", "No access")]) {
      expect(() => redirectIfCredentialRejected(err, "/")).not.toThrow();
    }

    expect(redirect).not.toHaveBeenCalled();
  });

  it("does not redirect for a non-ApiError", () => {
    expect(() => redirectIfCredentialRejected(new TypeError("fetch failed"), "/")).not.toThrow();

    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("publicReadFailure", () => {
  it("sends a rejected credential to login", () => {
    expect(() => publicReadFailure(rejected, "/u/anaya")).toThrow(RedirectSignal);

    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fu%2Fanaya");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("sends a missing resource to the not-found page", () => {
    expect(() => publicReadFailure(missing, "/u/anaya")).toThrow(NotFoundSignal);

    expect(notFound).toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("rethrows a server error unchanged for the error boundary", () => {
    expect(() => publicReadFailure(broken, "/u/anaya")).toThrow(broken);

    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("rethrows a non-ApiError unchanged", () => {
    const network = new TypeError("fetch failed");

    expect(() => publicReadFailure(network, "/u/anaya")).toThrow(network);

    expect(redirect).not.toHaveBeenCalled();
    expect(notFound).not.toHaveBeenCalled();
  });
});
