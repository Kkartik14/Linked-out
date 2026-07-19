import { expect, test } from "@playwright/test";
import { BffCallerAssertionSigner, INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";
import {
  sessionResolveResponseSchema,
  type SessionResolveResponse,
} from "@linkedout/contracts";

import {
  API_ORIGIN,
  BFF_CALLER_SECRET,
  createBrowserSession,
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
async function resolve(
  cookie: string,
): Promise<{ status: number; body: SessionResolveResponse }> {
  const signer = new BffCallerAssertionSigner(BFF_CALLER_SECRET);
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
});
