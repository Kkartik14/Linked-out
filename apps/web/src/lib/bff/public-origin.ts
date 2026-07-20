/**
 * Validated browser-facing origin for server-side self-hops and security comparisons.
 *
 * Never derive this from `Host`/`X-Forwarded-*`: those are request data and can turn an RSC fetch
 * into SSRF or make an attacker-selected Origin pass the CSRF check when an ingress is permissive.
 */
export function publicWebOrigin(): string {
  if (typeof window !== "undefined") {
    throw new Error("The public web origin is server-only.");
  }

  const configured = process.env.WEB_URL;
  if (!configured) throw new Error("WEB_URL is required in handoff mode.");

  const parsed = new URL(configured);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("WEB_URL must be an HTTP(S) origin without credentials or a path.");
  }

  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:" && !isLoopback) {
    throw new Error("WEB_URL must use HTTPS in production.");
  }

  return parsed.origin;
}
