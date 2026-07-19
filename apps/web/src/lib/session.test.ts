import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/lib/api";
import { mockUser } from "@/test/utils";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMe: vi.fn() };
});

vi.mock("next/navigation", () => ({
  // The real `redirect` throws to unwind the render; a sentinel lets us assert both that it
  // fired and where to, without a Next request context.
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));

import { getSession, requireViewer } from "@/lib/session";
import { getMe } from "@/lib/api";
import { redirect } from "next/navigation";
import { connection } from "next/server";

afterEach(() => {
  vi.clearAllMocks();
});

describe("getSession — distinguishing states instead of flattening to logged-out (AUTH-06)", () => {
  it("establishes request scope before handling API availability failures", async () => {
    const requestContextSignal = new Error("NEXT_DYNAMIC_SERVER_USAGE");
    vi.mocked(connection).mockRejectedValueOnce(requestContextSignal);

    await expect(getSession()).rejects.toBe(requestContextSignal);
    expect(getMe).not.toHaveBeenCalled();
  });

  it("reports an authenticated viewer", async () => {
    vi.mocked(getMe).mockResolvedValue({ user: mockUser, needsOnboarding: false });
    await expect(getSession()).resolves.toEqual({
      status: "authenticated",
      user: mockUser,
      needsOnboarding: false,
    });
  });

  it("reports a guest when no credential was presented", async () => {
    // `/auth/me` answers 200 { user: null } for an absent credential.
    vi.mocked(getMe).mockResolvedValue({ user: null, needsOnboarding: false });
    await expect(getSession()).resolves.toEqual({ status: "guest" });
  });

  it("reports rejected — not guest — when a presented credential is refused (401)", async () => {
    // Contract §0/AUTH-06: a credential was presented and the API refused it. That is not the
    // same fact as a clean guest, and collapsing them is the forbidden downgrade.
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, "UNAUTHENTICATED", "no"));
    await expect(getSession()).resolves.toEqual({ status: "rejected" });
  });

  it("reports unavailable — not guest — when identity cannot be determined", async () => {
    // The whole point of AUTH-06: a 5xx is an outage, not a sign-out. Rendering it as guest
    // would hide the user's own menu and bounce them to /login on a live session.
    vi.mocked(getMe).mockRejectedValue(new ApiError(500, "INTERNAL", "boom"));
    await expect(getSession()).resolves.toEqual({ status: "unavailable" });
  });

  it("reports unavailable on a network failure or timeout", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("network down"));
    await expect(getSession()).resolves.toEqual({ status: "unavailable" });
  });

  it("never throws — the layout renders on every outcome", async () => {
    vi.mocked(getMe).mockRejectedValue(new Error("anything"));
    await expect(getSession()).resolves.toBeDefined();
  });
});

describe("requireViewer — gating a protected page", () => {
  it("returns the viewer when authenticated", () => {
    const session = { status: "authenticated" as const, user: mockUser, needsOnboarding: false };
    expect(requireViewer(session, "/settings")).toBe(session);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("sends a guest to sign in, preserving a safe returnTo", () => {
    expect(() => requireViewer({ status: "guest" }, "/settings")).toThrow(/REDIRECT:/);
    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fsettings");
  });

  it("sends a rejected credential to sign in, like a guest", () => {
    expect(() => requireViewer({ status: "rejected" }, "/settings")).toThrow(/REDIRECT:/);
    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2Fsettings");
  });

  it("rejects an unsafe returnTo rather than opening a redirect", () => {
    expect(() => requireViewer({ status: "guest" }, "https://evil.example")).toThrow(/REDIRECT:/);
    // Falls back to "/", never the attacker's absolute URL.
    expect(redirect).toHaveBeenCalledWith("/login?returnTo=%2F");
  });

  it("throws to the error boundary when unavailable — never to /login", () => {
    // We do not know they are logged out, only that we could not find out; redirecting them
    // to sign in would assert a fact we don't have and could trap a live session in a loop.
    expect(() => requireViewer({ status: "unavailable" }, "/settings")).toThrow(
      /couldn't confirm your session/,
    );
    expect(redirect).not.toHaveBeenCalled();
  });
});
