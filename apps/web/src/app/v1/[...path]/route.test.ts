// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/bff/session-resolver", () => ({ resolveBffSession: vi.fn() }));
vi.mock("@/lib/bff/internal-client", () => ({
  internalApiOrigin: () => "http://nest.internal",
}));
vi.mock("@/lib/bff/public-origin", () => ({
  publicWebOrigin: () => "http://localhost:3100",
}));

import { NextRequest } from "next/server";
import { resolveBffSession } from "@/lib/bff/session-resolver";
import { GET, POST } from "./route";

const ORIGIN = "http://localhost:3100";

function req(path: string, init: RequestInit = {}): NextRequest {
  return new NextRequest(new Request(new URL(`${ORIGIN}${path}`), init));
}

/** The headers the handler forwarded to Nest on its (mocked) upstream fetch. */
function forwardedHeaders(): Headers {
  return new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers);
}

beforeEach(() => {
  vi.stubEnv("OAUTH_SESSION_MODE", "handoff");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("BFF /v1 catch-all handler", () => {
  it("answers 404 in legacy mode and never touches the session", async () => {
    vi.stubEnv("OAUTH_SESSION_MODE", "legacy");
    const res = await GET(req("/v1/feed"));
    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
    expect(resolveBffSession).not.toHaveBeenCalled();
  });

  it("answers 404 for private, internal-only routes", async () => {
    for (const path of ["/v1/auth/sessions/resolve", "/v1/auth/oauth/handoff/exchange", "/v1/health/database"]) {
      expect((await POST(req(path, { method: "POST" }))).status).toBe(404);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards an OAuth leg anonymously even with a stale lo_sid, without resolving it (#1)", async () => {
    // The bug: a stale cookie made /v1/auth/google return 401 instead of redirecting to the provider.
    const res = await GET(req("/v1/auth/google?returnTo=%2Fsaved", { headers: { cookie: "lo_sid=stale" } }));
    expect(resolveBffSession).not.toHaveBeenCalled();
    expect(res.status).toBe(200); // forwarded to Nest, not a SESSION_REJECTED 401
    expect(forwardedHeaders().has("x-internal-auth")).toBe(false); // anonymous
    expect(String(vi.mocked(fetch).mock.calls[0]?.[0])).toBe("http://nest.internal/v1/auth/google?returnTo=%2Fsaved");
  });

  it("strips client-controlled X-Forwarded-* before forwarding to Nest (#2)", async () => {
    vi.mocked(resolveBffSession).mockResolvedValue({
      status: "authenticated",
      assertion: "api-assertion",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    await POST(
      req("/v1/ls", {
        method: "POST",
        headers: {
          origin: ORIGIN,
          "content-type": "application/json",
          cookie: "lo_sid=live",
          "x-forwarded-for": "6.6.6.6",
          forwarded: "for=6.6.6.6",
          "x-real-ip": "6.6.6.6",
        },
      }),
    );
    const sent = forwardedHeaders();
    expect(sent.get("x-forwarded-for")).toBeNull();
    expect(sent.get("forwarded")).toBeNull();
    expect(sent.get("x-real-ip")).toBeNull();
    expect(sent.get("x-internal-auth")).toBe("api-assertion"); // the minted one is injected
    expect(sent.has("cookie")).toBe(false); // browser cookies never reach Nest
  });

  it("rejects a hostile-origin unsafe request (403) before resolving", async () => {
    const res = await POST(
      req("/v1/ls", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" } }),
    );
    expect(res.status).toBe(403);
    expect(resolveBffSession).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards a request with no cookie anonymously", async () => {
    await GET(req("/v1/feed"));
    expect(resolveBffSession).not.toHaveBeenCalled();
    expect(forwardedHeaders().has("x-internal-auth")).toBe(false);
  });

  it("injects the minted assertion for an authenticated session", async () => {
    vi.mocked(resolveBffSession).mockResolvedValue({
      status: "authenticated",
      assertion: "abc",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    await GET(req("/v1/feed", { headers: { cookie: "lo_sid=live" } }));
    expect(forwardedHeaders().get("x-internal-auth")).toBe("abc");
  });

  it("answers 401 and clears lo_sid for a rejected credential", async () => {
    vi.mocked(resolveBffSession).mockResolvedValue({ status: "unauthenticated", reason: "revoked" });
    const res = await GET(req("/v1/feed", { headers: { cookie: "lo_sid=dead" } }));
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toMatch(/lo_sid=;.*Max-Age=0/i);
    expect(fetch).not.toHaveBeenCalled(); // never forwarded as a guest
  });

  it("answers 503 and keeps the cookie on a resolution outage (AUTH-06)", async () => {
    vi.mocked(resolveBffSession).mockRejectedValue(new Error("nest down"));
    const res = await GET(req("/v1/feed", { headers: { cookie: "lo_sid=live" } }));
    expect(res.status).toBe(503);
    expect(res.headers.get("set-cookie")).toBeNull(); // outage is not a sign-out
  });
});
