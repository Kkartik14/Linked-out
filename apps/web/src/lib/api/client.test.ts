import { beforeEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "./client";
import { ApiError } from "./errors";

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    ...init,
  });
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("sends credentials, no-store cache, and JSON content type for writes", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await expect(apiFetch("/ls", { method: "POST", body: JSON.stringify({ title: "T" }) }))
      .resolves.toEqual({ ok: true });

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/ls$/);
    expect(init).toMatchObject({ method: "POST", credentials: "include", cache: "no-store" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
  });

  it("returns undefined for 204 responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(apiFetch("/comments/1", { method: "DELETE" })).resolves.toBeUndefined();
  });

  it("throws ApiError from the backend error envelope", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Some fields need attention.",
            details: [{ field: "title", code: "required", message: "Required" }],
          },
        },
        { status: 400 },
      ),
    );

    await expect(apiFetch("/ls", { method: "POST" })).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Some fields need attention.",
      details: [{ field: "title", code: "required", message: "Required" }],
    });
  });

  it("refreshes once on TOKEN_EXPIRED and retries with rotated cookies", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "TOKEN_EXPIRED", message: "expired" } },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(
        {
          ok: true,
          status: 200,
          headers: {
            getSetCookie: () => ["access_token=fresh; Path=/", "refresh_token=next; Path=/"],
            get: () => null,
          },
          json: async () => ({ ok: true }),
        } as unknown as Response,
      )
      .mockResolvedValueOnce(jsonResponse({ data: "retried" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ data: "retried" });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toMatch(/\/auth\/refresh$/);
    const retryHeaders = new Headers(vi.mocked(fetch).mock.calls[2]![1]?.headers);
    expect(retryHeaders.get("cookie")).toContain("access_token=fresh");
    expect(retryHeaders.get("cookie")).toContain("refresh_token=next");
  });

  it("does not refresh non-expired 401 responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "You must be signed in." } },
        { status: 401 },
      ),
    );

    await expect(apiFetch("/me/saved")).rejects.toBeInstanceOf(ApiError);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
