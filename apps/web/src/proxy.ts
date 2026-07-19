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
 * Inert until the cutover: a straight pass-through in legacy, where auth rides the legacy access
 * cookie and this optimistic signal (`lo_sid`) does not exist.
 */

const LO_SID = "lo_sid";

const PROTECTED_PREFIXES = ["/new", "/saved", "/settings", "/notifications", "/onboarding"];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxy(request: NextRequest): NextResponse {
  if (!isHandoffMode()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (isProtected(pathname) && !request.cookies.has(LO_SID)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `returnTo=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets; run on everything else. The gating above only acts on
  // PROTECTED_PREFIXES, so /v1/* and public pages fall straight through untouched.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
