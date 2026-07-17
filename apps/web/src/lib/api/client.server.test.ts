// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

import { cookies } from "next/headers";
import { apiFetch } from "./client";

describe("apiFetch during server rendering", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("lets Next's request-context signal escape instead of continuing without cookies", async () => {
    const requestContextSignal = new Error("NEXT_DYNAMIC_SERVER_USAGE");
    vi.mocked(cookies).mockRejectedValueOnce(requestContextSignal);

    await expect(apiFetch("/auth/me")).rejects.toBe(requestContextSignal);
    expect(fetch).not.toHaveBeenCalled();
  });
});
