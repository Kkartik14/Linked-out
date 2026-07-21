// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));

import { cookies, headers } from "next/headers";
import { apiFetch } from "./client";

describe("apiFetch during server rendering", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lets Next's request-context signal escape instead of continuing without cookies", async () => {
    const requestContextSignal = new Error("NEXT_DYNAMIC_SERVER_USAGE");
    vi.mocked(cookies).mockRejectedValueOnce(requestContextSignal);

    await expect(apiFetch("/auth/me")).rejects.toBe(requestContextSignal);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("self-hops to the configured public origin and forwards only lo_sid", async () => {
    vi.stubEnv("OAUTH_SESSION_MODE", "handoff");
    vi.stubEnv("WEB_URL", "https://linkedout.example");
    vi.stubEnv("VERCEL_AUTOMATION_BYPASS_SECRET", "frontend-preview-bypass");
    vi.mocked(headers).mockResolvedValueOnce(
      new Headers({ host: "attacker.example", "x-forwarded-proto": "http" }),
    );
    const cookieStore = {
      get: vi.fn((name: string) =>
        name === "lo_sid" ? { name, value: "opaque-session" } : undefined,
      ),
      toString: () => "lo_sid=opaque-session; analytics=private; lo_oauth_state=secret",
    };
    vi.mocked(cookies).mockResolvedValueOnce(cookieStore as never);
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(apiFetch("/auth/me")).resolves.toEqual({ ok: true });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toBe("https://linkedout.example/v1/auth/me");
    const requestHeaders = new Headers(init?.headers);
    expect(requestHeaders.get("cookie")).toBe("lo_sid=opaque-session");
    expect(requestHeaders.get("x-vercel-protection-bypass")).toBe(
      "frontend-preview-bypass",
    );
  });
});
