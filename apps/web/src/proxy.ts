import { NextResponse, type NextRequest } from "next/server";

import { isHandoffMode } from "@/lib/bff/mode";

/**
 * The thin routing boundary (ADR 0001 §4.1; the Next 16 successor to `middleware.ts`).
 *
 * Next's own Proxy guidance is explicit that it must NOT be a session or authorization layer, so
 * this does exactly one thing: **optimistic** protected-route gating. It redirects an obviously
 * signed-out navigation away from a protected page based on the mere presence of the `lo_sid`
 * cookie — no session resolution, no DB lookup, no state. The page still resolves the session
 * server-side and is the real gate; this only avoids rendering a protected shell we already know
 * will bounce. Ordinary `/v1/*` traffic is served by the `app/v1/[...path]` route handler, so
 * nothing is rewritten here.
 *
 * The optimistic gating is handoff-only (legacy auth rides the access cookie, and this `lo_sid`
 * signal does not exist there). The private/no-store cache default it also applies is correct in
 * both modes — authenticated HTML is viewer-dependent regardless of session topology.
 */

const LO_SID = "lo_sid";

const PROTECTED_PREFIXES = ["/new", "/saved", "/settings", "/notifications", "/onboarding"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Optimistic protected-route gating (handoff only): redirect an obviously signed-out navigation
  // before rendering a shell we know will bounce. The page still resolves the session server-side.
  if (isHandoffMode() && isProtected(pathname) && !request.cookies.has(LO_SID)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `returnTo=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  const response = NextResponse.next();
  // Authenticated HTML and viewer-dependent page responses default to private/no-store, so a
  // shared cache never keeps one viewer's rendered page and serves it to another. Public caching
  // is an explicit opt-in. `/v1/*` API responses are left to the route handler's own policy, so a
  // deliberately cacheable public read (e.g. GET /v1/meta/enums) is not forced to no-store here.
  if (!pathname.startsWith("/v1/")) {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  return response;
}

export const config = {
  // Skip Next internals and static assets; run on everything else. The gating above only acts on
  // PROTECTED_PREFIXES, so /v1/* and public pages fall straight through untouched.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
