// @vitest-environment node
//
// This module is server-only and refuses to run where `window` exists; jsdom (the suite
// default) provides one, so it must be exercised in the runtime it actually runs in.
import {
  BffCallerAssertionVerifier,
  INTERNAL_AUTH_HEADER,
} from "@linkedout/internal-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resolveBffSession } from "@/lib/bff/session-resolver";

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

describe("resolveBffSession", () => {
  it("authenticates the resolve call with a real session-resolve assertion", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: "unauthenticated", reason: "invalid" }),
    );

    await resolveBffSession("A".repeat(43));

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe(`${BASE_URL}/v1/auth/sessions/resolve`);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({ cookie: "A".repeat(43) });

    // The strongest possible assertion: the token the BFF minted is accepted by the exact
    // verifier the API guards with. A format drift between the tiers fails here, not in prod.
    const header = new Headers(init?.headers).get(INTERNAL_AUTH_HEADER);
    const verifier = new BffCallerAssertionVerifier(SECRET);
    const verdict = verifier.verify(header ?? undefined, "session-resolve");
    expect(verdict.kind).toBe("authenticated");
    expect(verifier.verify(header ?? undefined, "auth-exchange").kind).toBe("invalid");
  });

  it("returns the authenticated session verbatim", async () => {
    const session = {
      status: "authenticated" as const,
      assertion: "api-issued-user-assertion",
      expiresAt: "2026-08-01T00:00:00.000Z",
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(session));

    await expect(resolveBffSession("cookie")).resolves.toEqual(session);
  });

  it.each(["invalid", "expired", "revoked"] as const)(
    "surfaces the %s reason a session is not live",
    async (reason) => {
      vi.mocked(fetch).mockResolvedValueOnce(
        jsonResponse({ status: "unauthenticated", reason }),
      );

      await expect(resolveBffSession("cookie")).resolves.toEqual({
        status: "unauthenticated",
        reason,
      });
    },
  );

  it("throws on a failed resolve call rather than reporting a clean guest", async () => {
    // A 500 from the API is an outage, not a sign-out. Collapsing it to `unauthenticated` would
    // render an infrastructure failure as a legitimate logged-out user (AUTH-06).
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: {} }, { status: 500 }));

    await expect(resolveBffSession("cookie")).rejects.toThrow(/status 500/);
  });

  it("throws when the response does not match the contract", async () => {
    // Schema drift between endpoint and consumer must be loud, never a silently wrong session.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ status: "maybe" }));

    await expect(resolveBffSession("cookie")).rejects.toThrow();
  });

  it("rejects the impossible absent state instead of widening the wire contract", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ status: "unauthenticated", reason: "absent" }),
    );

    await expect(resolveBffSession("cookie")).rejects.toThrow();
  });

  it("refuses to run in a browser, where the signing secret must never be", async () => {
    vi.stubGlobal("window", {});

    await expect(resolveBffSession("cookie")).rejects.toThrow(/server-only/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses plaintext internal transport in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INTERNAL_API_BASE_URL", "http://api.internal:4000");
    vi.resetModules();
    const { resolveBffSession: resolveWithProductionConfig } = await import(
      "@/lib/bff/session-resolver"
    );

    await expect(resolveWithProductionConfig("cookie")).rejects.toThrow(/HTTPS.*production/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
