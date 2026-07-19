"use server";

import { cookies } from "next/headers";
import { oauthHandoffCodeSchema } from "@linkedout/contracts";

import { exchangeOAuthHandoff } from "@/lib/bff/lifecycle";

const LO_SID = "lo_sid";

/**
 * Exchange a one-time OAuth handoff code for a browser session and set the host-only `lo_sid`
 * cookie on the outer response (ADR 0001 §4.3).
 *
 * A Server Action is the browser-visible response boundary an RSC lacks: `cookies().set` here
 * actually reaches the browser. Nest consumes the code and creates the authoritative session in
 * one transaction; the BFF only sets the opaque value it returns. `returnTo` was validated at
 * OAuth start and bound to the code server-side, so it is safe to navigate to — the BFF never
 * reads a destination off the URL (no open redirect). The code is shape-validated against the
 * shared contract before use.
 *
 * `secure` is gated to production so the same `SameSite=Lax` cookie works over `http://localhost`
 * in development and e2e, matching the legacy cookie posture.
 */
export async function exchangeHandoff(
  code: string,
): Promise<{ ok: true; returnTo: string } | { ok: false }> {
  const parsed = oauthHandoffCodeSchema.safeParse(code);
  if (!parsed.success) return { ok: false };

  try {
    const { cookie, expiresAt, returnTo } = await exchangeOAuthHandoff(parsed.data);
    (await cookies()).set(LO_SID, cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresAt),
    });
    return { ok: true, returnTo };
  } catch {
    return { ok: false };
  }
}
