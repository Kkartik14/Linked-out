export const OAUTH_STATE_COOKIE = "lo_oauth_state";

const OAUTH_CALLBACK_PATH = /^\/v1\/auth\/(?:google|github)\/callback$/;

/**
 * OAuth callbacks are the sole exception to the BFF's browser-cookie stripping rule.
 * Nest needs its nonce cookie to validate the provider's `state`, but it must never receive
 * `lo_sid`, legacy credentials, or unrelated browser cookies.
 */
export function oauthStateCookieForUpstream(
  pathname: string,
  stateCookie: string | undefined,
): string | null {
  if (!stateCookie || !OAUTH_CALLBACK_PATH.test(pathname)) return null;
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(stateCookie)}`;
}
