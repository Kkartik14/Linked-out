import { NextResponse, type NextRequest } from "next/server";

import {
  BROWSER_SESSION_COOKIE,
  browserSessionCookieOptions,
} from "@/lib/bff/browser-session-cookie";
import { PRIVATE_NO_STORE } from "@/lib/bff/cache-policy";
import { publicWebOrigin } from "@/lib/bff/public-origin";
import { safeReturnTo } from "@/lib/auth-entry";

/** Commit the RSC-detected session tombstone on a response the browser can actually observe. */
export function GET(request: NextRequest): NextResponse {
  const destination = new URL("/login", publicWebOrigin());
  destination.searchParams.set(
    "returnTo",
    safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
  );
  const response = NextResponse.redirect(destination);
  response.headers.set("cache-control", PRIVATE_NO_STORE);

  // Clear the cookie only for a genuine same-origin navigation (the requireViewer redirect). A
  // cross-site subresource — `<img src="…/auth/session/rejected">` — sets `Sec-Fetch-Site:
  // cross-site`; honouring its cookie clear would be a logout-CSRF. When the signal is absent (an
  // older browser) we still clear: the worst case is a forced re-login, and the legitimate path
  // always carries a `same-origin`/`none` value.
  if (request.headers.get("sec-fetch-site") !== "cross-site") {
    response.cookies.set(BROWSER_SESSION_COOKIE, "", {
      ...browserSessionCookieOptions(),
      maxAge: 0,
    });
  }
  return response;
}
