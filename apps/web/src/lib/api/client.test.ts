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

  it("preserves an explicit anonymous Next revalidation policy", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ lType: [] }));

    await apiFetch("/meta/enums", {
      cache: "force-cache",
      credentials: "omit",
      headers: { cookie: "must-not-cross-the-public-cache" },
      next: { revalidate: 86_400 },
    });

    expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({
      cache: "force-cache",
      credentials: "omit",
      next: { revalidate: 86_400 },
    });
    expect(new Headers(vi.mocked(fetch).mock.calls[0]?.[1]?.headers).has("cookie")).toBe(false);
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

  it("parses Retry-After so query retries can honor the server delay", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(
        { error: { code: "RATE_LIMITED", message: "Slow down." } },
        { status: 429, headers: { "Retry-After": "3" } },
      ),
    );

    await expect(apiFetch("/feed")).rejects.toMatchObject({
      status: 429,
      code: "RATE_LIMITED",
      retryAfterMs: 3_000,
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

  it("shares one refresh rotation across a burst of expired browser requests", async () => {
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await Promise.resolve();
        return {
          ok: true,
          status: 200,
          headers: {
            getSetCookie: () => ["access_token=fresh; Path=/", "refresh_token=next; Path=/"],
            get: () => null,
          },
          json: async () => ({ ok: true }),
        } as unknown as Response;
      }
      const count = attempts.get(url) ?? 0;
      attempts.set(url, count + 1);
      if (count === 0) {
        return jsonResponse(
          { error: { code: "TOKEN_EXPIRED", message: "expired" } },
          { status: 401 },
        );
      }
      return jsonResponse({ ok: true });
    });

    await expect(Promise.all([apiFetch("/feed"), apiFetch("/notifications")])).resolves.toEqual([
      { ok: true },
      { ok: true },
    ]);
    expect(refreshCalls).toBe(1);
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
