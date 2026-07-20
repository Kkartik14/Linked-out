// @vitest-environment node
//
// The BFF lifecycle client is server-only and refuses to run where `window` exists; jsdom (the
// suite default) provides one, so it must be exercised in the runtime it actually runs in.
import {
  BffCallerAssertionVerifier,
  INTERNAL_AUTH_HEADER,
} from "@linkedout/internal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { exchangeOAuthHandoff, revokeBffSession } from "@/lib/bff/lifecycle";

const SECRET = "test-internal-secret-0123456789abcdefgh";
const BASE_URL = "http://api.internal:4000";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

beforeEach(() => {
  vi.stubEnv("BFF_CALLER_SECRET", SECRET);
  vi.stubEnv("INTERNAL_API_BASE_URL", BASE_URL);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("revokeBffSession", () => {
  it("authenticates with a session-revoke assertion and posts the cookie", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(revokeBffSession("A".repeat(43))).resolves.toEqual({ ok: true });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${BASE_URL}/v1/auth/sessions/revoke`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ cookie: "A".repeat(43) });

    // The minted token must be accepted for revoke and rejected for any other purpose — a
    // cross-purpose token would let a resolve caller silently tombstone a session.
    const header = new Headers(init?.headers).get(INTERNAL_AUTH_HEADER);
    const verifier = new BffCallerAssertionVerifier(SECRET);
    expect(verifier.verify(header ?? undefined, "session-revoke").kind).toBe("authenticated");
    expect(verifier.verify(header ?? undefined, "session-resolve").kind).toBe("invalid");
  });

  it("throws on a failed revoke rather than reporting success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: {} }, { status: 500 }));
    await expect(revokeBffSession("cookie")).rejects.toThrow(/status 500/);
  });
});

describe("exchangeOAuthHandoff", () => {
  it("authenticates with an auth-exchange assertion and returns the created session", async () => {
    const exchanged = {
      cookie: "B".repeat(43),
      expiresAt: "2026-10-01T00:00:00.000Z",
      returnTo: "/saved",
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(exchanged));

    await expect(exchangeOAuthHandoff("C".repeat(43))).resolves.toEqual(exchanged);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${BASE_URL}/v1/auth/oauth/handoff/exchange`);
    expect(JSON.parse(String(init?.body))).toEqual({ code: "C".repeat(43) });

    const header = new Headers(init?.headers).get(INTERNAL_AUTH_HEADER);
    const verifier = new BffCallerAssertionVerifier(SECRET);
    expect(verifier.verify(header ?? undefined, "auth-exchange").kind).toBe("authenticated");
    expect(verifier.verify(header ?? undefined, "session-revoke").kind).toBe("invalid");
  });

  it("throws when the response does not match the contract", async () => {
    // A malformed cookie is schema drift, not a session — it must be loud, never a bad cookie set.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ cookie: "too-short" }));
    await expect(exchangeOAuthHandoff("C".repeat(43))).rejects.toThrow();
  });
});
