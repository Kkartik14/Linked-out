import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ API_BASE_URL: "/v1" }));
vi.mock("@/lib/session-channel", () => ({ publishSessionExpired: vi.fn() }));

import { publishSessionExpired } from "@/lib/session-channel";
import { apiFetch } from "./client";

function rejected(code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: "rejected" } }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

describe("apiFetch in handoff mode", () => {
  beforeEach(() => {
    vi.mocked(publishSessionExpired).mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("invalidates the browser snapshot when the BFF rejects lo_sid", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rejected("SESSION_REJECTED"));
    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ code: "SESSION_REJECTED" });
    expect(publishSessionExpired).toHaveBeenCalledOnce();
  });

  it("does not turn an ordinary guest 401 into a session-expiry event", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(rejected("UNAUTHENTICATED"));
    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(publishSessionExpired).not.toHaveBeenCalled();
  });
});
