import { NextResponse, type NextRequest } from "next/server";

import { csrfRejection } from "@/lib/bff/csrf";
import { revokeBffSession } from "@/lib/bff/lifecycle";
import { isHandoffMode } from "@/lib/bff/mode";

/**
 * Tombstone-first BFF logout (ADR 0001 §4.5). A more specific route than the `/v1/[...path]`
 * catch-all, so it owns `/v1/auth/logout` instead of forwarding it to the legacy token endpoint.
 *
 * Order matters: revoke the server session BEFORE clearing the browser cookie, so a crash between
 * the two can never strand a live server session with no cookie left to revoke it. Idempotent by
 * the API's design — an absent, invalid, expired, or already-revoked cookie still yields
 * `{ ok: true }`, so a repeat logout stays a `200`.
 *
 * Inert until the cutover: `404` in legacy, where the browser logs out against Nest directly.
 */

const LO_SID = "lo_sid";

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isHandoffMode()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const rejection = csrfRejection(request, request.nextUrl.origin);
  if (rejection) {
    return NextResponse.json(
      { error: { code: "CSRF_REJECTED", message: `Cross-site ${rejection} rejected.` } },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  const cookie = request.cookies.get(LO_SID)?.value;
  if (cookie) {
    try {
      await revokeBffSession(cookie);
    } catch {
      // A revoke that could not reach Nest: do not clear the cookie and claim success. Surface it
      // so the caller retries instead of believing it is signed out while the server row lives on.
      return NextResponse.json(
        { error: { code: "LOGOUT_UNAVAILABLE", message: "Could not complete sign-out." } },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  }

  const response = NextResponse.json(
    { ok: true },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
  response.cookies.set(LO_SID, "", {
    maxAge: 0,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: true,
  });
  return response;
}
