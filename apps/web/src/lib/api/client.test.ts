import { PRINCIPAL_BINDING_HEADER } from "@linkedout/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ComposedPrincipal } from "@/lib/principal";
import { apiFetch } from "./client";
import { ApiError } from "./errors";

const COMPOSED = "01ARZ3NDEKTSV4RRFFQ69G5FAV" as string as ComposedPrincipal;

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

  it("puts the composing principal on the wire, under the contract's header name", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ ok: true }));

    await apiFetch("/ls", { method: "POST", principal: COMPOSED, body: "{}" });

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    // Asserted against the contract's own constant: the API matches on this exact name, and
    // a typo here is a 409 on every write with nothing in the diff to see.
    expect(new Headers(init?.headers).get(PRINCIPAL_BINDING_HEADER)).toBe(COMPOSED);
    // `principal` is ours, not `fetch`'s — it must be consumed, not forwarded as an option.
    expect(init).not.toHaveProperty("principal");
  });

  it("omits the header entirely when no principal is declared", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ data: [] }));

    await apiFetch("/feed");

    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(new Headers(init?.headers).has(PRINCIPAL_BINDING_HEADER)).toBe(false);
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

  // The rotated cookie is deliberately NOT asserted on the retry: `Set-Cookie` is a
  // forbidden response header and `Cookie` a forbidden request header, so in a real browser
  // no userland code can read the rotation or replay it. The browser's own jar carries it,
  // and `credentials: "include"` is what puts it on the wire — which is the one thing worth
  // pinning here. Asserting a cookie header would only pass against a fabricated Response.
  it("refreshes once on TOKEN_EXPIRED, then retries the original request", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "TOKEN_EXPIRED", message: "expired" } },
          { status: 401 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }))
      .mockResolvedValueOnce(jsonResponse({ data: "retried" }));

    await expect(apiFetch("/auth/me")).resolves.toEqual({ data: "retried" });

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(String(vi.mocked(fetch).mock.calls[1]![0])).toMatch(/\/auth\/refresh$/);
    expect(vi.mocked(fetch).mock.calls[1]![1]).toMatchObject({
      method: "POST",
      credentials: "include",
    });

    // The retry is the original request, and it must still carry credentials.
    expect(String(vi.mocked(fetch).mock.calls[2]![0])).toMatch(/\/auth\/me$/);
    expect(vi.mocked(fetch).mock.calls[2]![1]).toMatchObject({ credentials: "include" });
  });

  it("gives up rather than looping when the retry is also expired", async () => {
    // A fresh Response per call: a body can only be read once.
    vi.mocked(fetch).mockImplementation(async () =>
      jsonResponse({ error: { code: "TOKEN_EXPIRED", message: "expired" } }, { status: 401 }),
    );

    await expect(apiFetch("/auth/me")).rejects.toMatchObject({
      status: 401,
      code: "TOKEN_EXPIRED",
    });

    // original + refresh + retry, and then it stops: no second refresh.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it("shares one refresh rotation across a burst of expired browser requests", async () => {
    let refreshCalls = 0;
    const attempts = new Map<string, number>();
    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await Promise.resolve();
        return jsonResponse({ ok: true });
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
