/** Nest endpoints reserved for private platform traffic and never exposed by the public BFF. */
const PRIVATE_API_PATHS = new Set([
  "/v1/health/private-api",
  "/v1/health/database",
  "/v1/health/session-authority",
  "/v1/auth/sessions/resolve",
  "/v1/auth/sessions/revoke",
  "/v1/auth/oauth/handoff/exchange",
]);

export function isPrivateApiPath(pathname: string): boolean {
  return PRIVATE_API_PATHS.has(pathname);
}
