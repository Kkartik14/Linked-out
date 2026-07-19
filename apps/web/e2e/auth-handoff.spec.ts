import { expect, test } from "@playwright/test";
import { BffCallerAssertionSigner, INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";
import { PRINCIPAL_BINDING_HEADER, sessionResolveResponseSchema } from "@linkedout/contracts";

import {
  API_ORIGIN,
  BFF_CALLER_SECRET,
  WEB_ORIGIN,
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
  test("AUTH-01: a live lo_sid authenticates a protected render and a client API call", async ({
    context,
    page,
  }) => {
    await signInBff(context, world.kartik);

    // A protected Server Component render survives — there is no 15-minute access boundary to
    // fall off. getSession() self-hops through /v1/auth/me, which resolves the lo_sid session.
    await page.goto("/saved");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible();

    // A client API call routes through the same-origin /v1 BFF and resolves the same session.
    const me = await context.request.get(`${WEB_ORIGIN}/v1/auth/me`);
    expect(me.status()).toBe(200);
    expect(((await me.json()) as { user?: { username?: string } }).user?.username).toBe("kartik");
  });

  test("AUTH-02: BFF logout tombstones the session, clears lo_sid, and is idempotent", async ({
    context,
  }) => {
    const cookie = await signInBff(context, world.kartik);
    expect(await resolveStatus(cookie)).toBe("authenticated");

    const first = await context.request.post(`${WEB_ORIGIN}/v1/auth/logout`, {
      headers: { origin: WEB_ORIGIN },
    });
    expect(first.status()).toBe(200);

    // Tombstoned server-side, and the browser cookie was cleared.
    expect(await resolveStatus(cookie)).toBe("unauthenticated");
    const sid = (await context.cookies()).find((c) => c.name === "lo_sid");
    expect(sid?.value ?? "").toBe("");

    // A repeat with an absent/stale cookie is still 200.
    const second = await context.request.post(`${WEB_ORIGIN}/v1/auth/logout`, {
      headers: { origin: WEB_ORIGIN },
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
