// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/bff/public-origin", () => ({
  publicWebOrigin: () => "http://localhost:3100",
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

function req(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(
    new Request("http://localhost:3100/auth/session/rejected?returnTo=%2Fsaved", { headers }),
  );
}

afterEach(() => vi.clearAllMocks());

describe("rejected-session healer", () => {
  it("clears lo_sid on a same-origin navigation and redirects to login", () => {
    const res = GET(req({ "sec-fetch-site": "same-origin" }));
    expect(res.headers.get("location")).toBe("http://localhost:3100/login?returnTo=%2Fsaved");
    expect(res.headers.get("set-cookie")).toMatch(/lo_sid=;.*Max-Age=0/i);
  });

  it("does NOT clear lo_sid for a cross-site subresource — logout-CSRF blocked (#3)", () => {
    const res = GET(req({ "sec-fetch-site": "cross-site" }));
    expect(res.headers.get("location")).toBe("http://localhost:3100/login?returnTo=%2Fsaved");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("still clears when the Sec-Fetch signal is absent (older browser)", () => {
    expect(GET(req()).headers.get("set-cookie")).toMatch(/lo_sid=;.*Max-Age=0/i);
  });

  it("never open-redirects: an unsafe returnTo falls back to /", () => {
    const res = new NextRequest(
      new URL("http://localhost:3100/auth/session/rejected?returnTo=https://evil.example"),
    );
    expect(GET(res).headers.get("location")).toBe("http://localhost:3100/login?returnTo=%2F");
  });
});
