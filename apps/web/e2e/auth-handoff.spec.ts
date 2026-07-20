import { expect, test } from "@playwright/test";
import { BffCallerAssertionSigner, INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";
import { PRINCIPAL_BINDING_HEADER, sessionResolveResponseSchema } from "@linkedout/contracts";

import {
  API_ORIGIN,
  BFF_CALLER_SECRET,
  INTERNAL_PROXY_PORT,
  WEB_ORIGIN,
  backdateBrowserSession,
  createHandoff,
  disconnect,
  seedWorld,
  signInBff,
  type World,
} from "./helpers";

/**
 * Handoff-mode acceptance (ADR 0001 §6). The app runs with OAUTH_SESSION_MODE=handoff and a
 * relative NEXT_PUBLIC base URL, so the browser holds only `lo_sid`, proxy.ts + the /v1 route
 * handler resolve it, and Server Components self-hop through /v1. These are the criteria that could
 * not run against the legacy access-cookie lifecycle.
 */

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

const signer = new BffCallerAssertionSigner(BFF_CALLER_SECRET);

/** Resolve a cookie through the real private endpoint to assert its server-side liveness. */
async function resolveStatus(cookie: string): Promise<string> {
  const res = await fetch(`${API_ORIGIN}/v1/auth/sessions/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_AUTH_HEADER]: signer.signSessionResolve(),
    },
    body: JSON.stringify({ cookie }),
  });
  return sessionResolveResponseSchema.parse(await res.json()).status;
}

test.describe("handoff session (lo_sid, one-origin BFF)", () => {
  test("the handoff callback atomically sets lo_sid and redirects to the bound destination", async ({
    context,
  }) => {
    const code = await createHandoff(world.kartik, "/saved");
    const callback = await context.request.get(
      `${WEB_ORIGIN}/auth/callback/handoff?code=${encodeURIComponent(code)}`,
      { maxRedirects: 0 },
    );

    expect(callback.status()).toBe(307);
    expect(callback.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    expect(callback.headers().location).toBe(`${WEB_ORIGIN}/auth/callback?returnTo=%2Fsaved`);
    const sid = (await context.cookies()).find(({ name }) => name === "lo_sid");
    expect(sid?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await resolveStatus(sid?.value ?? "")).toBe("authenticated");
  });

  test("AUTH-08: the public OAuth relay preserves state through the provider callback", async ({
    context,
  }) => {
    const start = await context.request.get(`${WEB_ORIGIN}/v1/auth/google?returnTo=%2Fsaved`, {
      maxRedirects: 0,
    });
    expect(start.status()).toBe(302);
    const provider = new URL(start.headers().location ?? "");
    const state = provider.searchParams.get("state");
    expect(state).toBeTruthy();
    expect((await context.cookies()).some(({ name }) => name === "lo_oauth_state")).toBe(true);

    const callback = await context.request.get(
      `${WEB_ORIGIN}/v1/auth/google/callback?error=access_denied&state=${encodeURIComponent(state ?? "")}`,
      { maxRedirects: 0 },
    );
    expect(callback.status()).toBe(302);
    expect(callback.headers().location).toBe(`${WEB_ORIGIN}/auth/callback?error=access_denied`);
  });

  test("the public BFF does not expose private operational or lifecycle routes", async ({
    context,
  }) => {
    for (const path of [
      "/v1/health/private-api",
      "/v1/auth/sessions/resolve",
      "/v1/auth/oauth/handoff/exchange",
    ]) {
      const response = await context.request.get(`${WEB_ORIGIN}${path}`);
      expect(response.status()).toBe(404);
      expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
    }
  });

  test("the public web tier exposes a cache-safe BFF liveness probe", async ({ context }) => {
    const response = await context.request.get(`${WEB_ORIGIN}/health/bff`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", component: "bff" });
    expect(response.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  });

  test("AUTH-01: lo_sid remains live beyond the former 15-minute access boundary", async ({
    context,
    page,
  }) => {
    const cookie = await signInBff(context, world.kartik);
    await backdateBrowserSession(cookie, 16 * 60 * 1_000);
    const names = (await context.cookies()).map(({ name }) => name);
    expect(names).toContain("lo_sid");
    expect(names).not.toContain("lo_access");
    expect(names).not.toContain("lo_refresh");

    // The protected RSC resolves the backdated session, then SavedList's browser apiFetch proves
    // the same session survives through the client runtime rather than a Node request shortcut.
    await page.goto("/saved");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByText("Nothing saved yet.", { exact: false })).toBeVisible();
  });

  test("AUTH-06: session-resolution outage is unavailable, never a guest downgrade", async ({
    context,
    page,
  }) => {
    const cookie = await signInBff(context, world.kartik);
    const faultUrl = `http://127.0.0.1:${INTERNAL_PROXY_PORT}/__e2e/session-resolve-fault`;
    await fetch(`${faultUrl}?enabled=1`, { method: "POST" });
    try {
      const api = await context.request.get(`${WEB_ORIGIN}/v1/auth/me`);
      expect(api.status()).toBe(503);
      expect(await api.json()).toMatchObject({ error: { code: "SESSION_UNAVAILABLE" } });
      expect((await context.cookies()).find(({ name }) => name === "lo_sid")?.value).toBe(cookie);

      await page.goto("/saved");
      await expect(page).toHaveURL(`${WEB_ORIGIN}/saved`);
      await expect(page.locator('section[role="alert"]')).toContainText(
        "This page could not be loaded.",
      );
      await expect(page.getByRole("link", { name: "Log in" })).toHaveCount(0);
      expect((await context.cookies()).find(({ name }) => name === "lo_sid")?.value).toBe(cookie);
    } finally {
      await fetch(`${faultUrl}?enabled=0`, { method: "POST" });
    }

    await page.reload();
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();
    await expect(page.getByText("Nothing saved yet.", { exact: false })).toBeVisible();
  });

  test("AUTH-02: BFF logout tombstones the session, clears lo_sid, and is idempotent", async ({
    context,
  }) => {
    const cookie = await signInBff(context, world.kartik);
    expect(await resolveStatus(cookie)).toBe("authenticated");

    const first = await context.request.post(`${WEB_ORIGIN}/v1/auth/logout`, {
      headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    });
    expect(first.status()).toBe(200);
    expect(first.headers()["cache-control"]).toBe("private, no-store, max-age=0");

    // Tombstoned server-side, and the browser cookie was cleared.
    expect(await resolveStatus(cookie)).toBe("unauthenticated");
    const sid = (await context.cookies()).find((c) => c.name === "lo_sid");
    expect(sid?.value ?? "").toBe("");

    // A repeat with an absent/stale cookie is still 200.
    const second = await context.request.post(`${WEB_ORIGIN}/v1/auth/logout`, {
      headers: { origin: WEB_ORIGIN, "content-type": "application/json" },
    });
    expect(second.status()).toBe(200);
  });

  test("AUTH-07: a hostile-origin unsafe request carrying a valid lo_sid is rejected", async ({
    context,
  }) => {
    await signInBff(context, world.kartik);

    const res = await context.request.post(`${WEB_ORIGIN}/v1/ls`, {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: { title: "hijack", story: "cross-site write should be blocked" },
    });
    expect(res.status()).toBe(403);
    expect(res.headers()["cache-control"]).toBe("private, no-store, max-age=0");
  });

  test("AUTH-05: many concurrent requests on one lo_sid all authenticate", async ({ context }) => {
    await signInBff(context, world.kartik);

    // No per-request token rotation exists to race; each request resolves + slides the same row.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => context.request.get(`${WEB_ORIGIN}/v1/auth/me`)),
    );
    for (const res of results) {
      expect(res.status()).toBe(200);
      expect(((await res.json()) as { user?: { username?: string } }).user?.username).toBe("kartik");
    }
  });

  test("AUTH-03/FRONTEND-24: a mutation declaring a different principal is rejected (409)", async ({
    context,
  }) => {
    await signInBff(context, world.kartik); // the live session is kartik's

    // A stale form composed under nadia declares her principal; the API binds the mutation to the
    // live credential and rejects the mismatch, even though the session and CSRF checks pass.
    const res = await context.request.post(`${WEB_ORIGIN}/v1/ls`, {
      headers: {
        origin: WEB_ORIGIN,
        "content-type": "application/json",
        [PRINCIPAL_BINDING_HEADER]: world.nadia.id,
      },
      data: { title: "stale", story: "composed under a different principal" },
    });
    expect(res.status()).toBe(409);
  });
});
