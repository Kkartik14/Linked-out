import { NextResponse, type NextRequest } from "next/server";
import { INTERNAL_AUTH_HEADER } from "@linkedout/internal-auth";

import { csrfRejection } from "@/lib/bff/csrf";
import {
  BROWSER_SESSION_COOKIE,
  browserSessionCookieOptions,
} from "@/lib/bff/browser-session-cookie";
import { internalApiOrigin } from "@/lib/bff/internal-client";
import { isHandoffMode } from "@/lib/bff/mode";
import { publicWebOrigin } from "@/lib/bff/public-origin";
import {
  OAUTH_STATE_COOKIE,
  oauthStateCookieForUpstream,
} from "@/lib/bff/oauth-relay";
import { resolveBffSession } from "@/lib/bff/session-resolver";

/**
 * The one-origin BFF for ordinary `/v1/*` traffic (ADR 0001 §4.2).
 *
 * The browser calls `/v1/*` on this public origin; it never sees the private Nest origin or a Nest
 * credential. For each request this handler runs the CSRF check, resolves `lo_sid` against the
 * private session API, injects the short-lived `X-Internal-Auth` assertion Nest returns, and
 * forwards to Nest. An absent cookie is forwarded anonymously; a rejected credential is cleared at
 * the edge and answered `401` rather than downgraded to a guest (contract §0). OAuth start/callback
 * are `/v1/auth/*` paths that flow through here too and are relayed faithfully (`redirect: manual`).
 *
 * Inert until the cutover: in legacy mode the browser talks to Nest directly, so this origin
 * exposes no `/v1` surface and the handler answers `404`.
 */

/** Cleared with the same host-only attributes the exchange set it with, so the browser drops it. */
function clearSidCookie(response: NextResponse): void {
  response.cookies.set(BROWSER_SESSION_COOKIE, "", {
    ...browserSessionCookieOptions(),
    maxAge: 0,
  });
}

function jsonError(code: string, message: string, status: number): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

/**
 * Forward the request to private Nest, carrying the minted assertion but never the browser's
 * cookies or a client-supplied internal-auth header. Redirects are relayed, not followed, so both
 * OAuth legs pass through unchanged.
 */
async function forwardToNest(
  request: NextRequest,
  assertion: string | null,
): Promise<NextResponse> {
  const target = `${internalApiOrigin()}${request.nextUrl.pathname}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete("cookie"); // stop forwarding the browser's complete cookie header
  const oauthStateCookie = oauthStateCookieForUpstream(
    request.nextUrl.pathname,
    request.cookies.get(OAUTH_STATE_COOKIE)?.value,
  );
  if (oauthStateCookie) headers.set("cookie", oauthStateCookie);
  headers.delete(INTERNAL_AUTH_HEADER); // the assertion is minted here, never accepted from the client
  headers.delete("host");
  headers.delete("content-length"); // fetch recomputes for the forwarded body
  if (assertion) headers.set(INTERNAL_AUTH_HEADER, assertion);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  // `fetch` already decoded the body; leaving these would make the browser decode it twice.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");
  // Preserve every Set-Cookie individually (the merged form corrupts multi-cookie OAuth relays).
  responseHeaders.delete("set-cookie");
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

async function handle(request: NextRequest): Promise<NextResponse> {
  if (!isHandoffMode()) return jsonError("NOT_FOUND", "Not found.", 404);

  const rejection = csrfRejection(request, publicWebOrigin());
  if (rejection) {
    return jsonError("CSRF_REJECTED", `Cross-site ${rejection} rejected.`, 403);
  }

  const cookie = request.cookies.get(BROWSER_SESSION_COOKIE)?.value;
  if (!cookie) {
    // No credential presented: forward as a guest, with no assertion.
    return forwardToNest(request, null);
  }

  let resolved;
  try {
    resolved = await resolveBffSession(cookie);
  } catch {
    // The introspection call failed — an outage, not a sign-out (AUTH-06). Keep the cookie.
    return jsonError("SESSION_UNAVAILABLE", "Could not verify your session right now.", 503);
  }

  if (resolved.status === "authenticated") {
    return forwardToNest(request, resolved.assertion);
  }

  // Presented but invalid/expired/revoked: a rejected credential, never a guest (contract §0).
  // Clear the broken cookie at the edge so the session heals without a per-page redirect.
  const response = jsonError("SESSION_REJECTED", "Your session is no longer valid.", 401);
  clearSidCookie(response);
  return response;
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as HEAD,
  handle as OPTIONS,
};
