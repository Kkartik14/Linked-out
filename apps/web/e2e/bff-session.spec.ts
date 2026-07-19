import { expect, test } from "@playwright/test";
import { BffCallerAssertionSigner, INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";
import {
  oauthHandoffExchangeResponseSchema,
  sessionResolveResponseSchema,
  type SessionResolveResponse,
} from "@linkedout/contracts";

import {
  API_ORIGIN,
  BFF_CALLER_SECRET,
  createBrowserSession,
  createHandoff,
  disconnect,
  seedWorld,
  signInBff,
  type World,
} from "./helpers";

/**
 * The one-origin BFF lifecycle fixture (ADR 0001 §4.2–4.3), proven end-to-end against the real
 * API before any Next BFF handler exists. `createBrowserSession` writes a real `BrowserSession`
 * row and hands back the opaque `lo_sid`; this suite confirms that cookie is one the production
 * `POST /v1/auth/sessions/resolve` endpoint actually accepts — so the acceptance suite
 * (AUTH-01/02/05/03) can build on a session lifecycle that matches production, not a
 * hand-minted access cookie.
 */

let world: World;

test.beforeEach(async () => {
  world = await seedWorld();
});

test.afterAll(async () => {
  await disconnect();
});

/**
 * Resolve a cookie through the real private endpoint, authenticated with a purpose-scoped
 * caller assertion — the exact protocol `src/lib/bff/session-resolver.ts` uses. The response is
 * parsed with the shared contract schema, so a wire drift fails loudly here rather than being
 * silently mis-read.
 */
const signer = new BffCallerAssertionSigner(BFF_CALLER_SECRET);

async function resolve(
  cookie: string,
): Promise<{ status: number; body: SessionResolveResponse }> {
  const res = await fetch(`${API_ORIGIN}/v1/auth/sessions/resolve`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_AUTH_HEADER]: signer.signSessionResolve(),
    },
    body: JSON.stringify({ cookie }),
  });
  return { status: res.status, body: sessionResolveResponseSchema.parse(await res.json()) };
}

async function revoke(cookie: string): Promise<number> {
  const res = await fetch(`${API_ORIGIN}/v1/auth/sessions/revoke`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_AUTH_HEADER]: signer.signSessionRevoke(),
    },
    body: JSON.stringify({ cookie }),
  });
  return res.status;
}

async function exchange(code: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${API_ORIGIN}/v1/auth/oauth/handoff/exchange`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [INTERNAL_AUTH_HEADER]: signer.signAuthExchange(),
    },
    body: JSON.stringify({ code }),
  });
  return { status: res.status, body: await res.json() };
}

test.describe("BFF session fixture (lo_sid lifecycle)", () => {
  test("a fixture-created lo_sid resolves to an authenticated session", async () => {
    const cookie = await createBrowserSession(world.kartik);

    const { status, body } = await resolve(cookie);

    expect(status).toBe(200);
    expect(body.status).toBe("authenticated");
  });

  test("a well-formed but unknown lo_sid resolves to unauthenticated", async () => {
    // 43 base64url chars: passes the opaque-cookie shape check and reaches the store lookup,
    // which finds no row — the "presented but invalid" credential the contract rejects.
    const { body } = await resolve("A".repeat(43));

    expect(body.status).toBe("unauthenticated");
  });

  test("signInBff installs an lo_sid cookie the API accepts", async ({ context }) => {
    const cookie = await signInBff(context, world.kartik);

    const installed = (await context.cookies()).find((c) => c.name === "lo_sid");
    expect(installed?.value).toBe(cookie);

    const { body } = await resolve(cookie);
    expect(body.status).toBe("authenticated");
  });

  test("revoking a session tombstones it: a later resolve is revoked", async () => {
    const cookie = await createBrowserSession(world.kartik);
    expect((await resolve(cookie)).body.status).toBe("authenticated");

    expect(await revoke(cookie)).toBe(200);

    const after = await resolve(cookie);
    expect(after.body.status).toBe("unauthenticated");
    if (after.body.status === "unauthenticated") expect(after.body.reason).toBe("revoked");
  });

  test("revoke is idempotent — repeats stay 200 even for an unknown cookie", async () => {
    const cookie = await createBrowserSession(world.kartik);
    expect(await revoke(cookie)).toBe(200);
    expect(await revoke(cookie)).toBe(200); // already revoked
    expect(await revoke("A".repeat(43))).toBe(200); // never existed
  });

  test("an OAuth handoff code exchanges into a session that resolves authenticated", async () => {
    const code = await createHandoff(world.kartik, "/saved");

    const { status, body } = await exchange(code);
    expect(status).toBe(200);
    const exchanged = oauthHandoffExchangeResponseSchema.parse(body);
    expect(exchanged.returnTo).toBe("/saved");

    // The opaque value the exchange returns is a live lo_sid.
    expect((await resolve(exchanged.cookie)).body.status).toBe("authenticated");
  });

  test("a handoff code is single-use — a second exchange is rejected", async () => {
    const code = await createHandoff(world.kartik, "/");
    expect((await exchange(code)).status).toBe(200);
    expect((await exchange(code)).status).toBe(400); // consumed → INVALID_HANDOFF
  });
});
