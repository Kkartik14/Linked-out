import { validatedHttpOrigin } from "./origin-validation";

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
  return validatedHttpOrigin(configured, "WEB_URL");
}
