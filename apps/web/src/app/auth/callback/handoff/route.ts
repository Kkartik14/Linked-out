import { NextResponse, type NextRequest } from "next/server";
import { oauthHandoffCodeSchema } from "@linkedout/contracts";

import {
  BROWSER_SESSION_COOKIE,
  browserSessionCookieOptions,
} from "@/lib/bff/browser-session-cookie";
import { exchangeOAuthHandoff } from "@/lib/bff/lifecycle";
import { isHandoffMode } from "@/lib/bff/mode";

function failureRedirect(request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL("/auth/callback?error=oauth_failed", request.nextUrl.origin));
}

/**
 * Browser-visible OAuth response boundary: consume the single-use handoff, set `lo_sid`, and
 * redirect in one response. A failed/replayed code never sets a cookie.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isHandoffMode()) return failureRedirect(request);
  const parsed = oauthHandoffCodeSchema.safeParse(request.nextUrl.searchParams.get("code"));
  if (!parsed.success) return failureRedirect(request);

  try {
    const handoff = await exchangeOAuthHandoff(parsed.data);
    const destination = new URL("/auth/callback", request.nextUrl.origin);
    destination.searchParams.set("returnTo", handoff.returnTo);
    const response = NextResponse.redirect(destination);
    response.cookies.set(
      BROWSER_SESSION_COOKIE,
      handoff.cookie,
      browserSessionCookieOptions(new Date(handoff.expiresAt)),
    );
    return response;
  } catch {
    return failureRedirect(request);
  }
}
