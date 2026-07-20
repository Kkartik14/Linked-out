/**
 * The single validator for an environment-configured HTTP(S) origin (ADR 0001 §4.2).
 *
 * Shared by the internal API origin (`internal-client.ts`) and the public web origin
 * (`public-origin.ts`) so the security-sensitive rules — no credentials, no path/query/hash, and
 * HTTPS in production except for a loopback host — can never drift between the two. Returns the bare
 * origin; throws an `envName`-labelled error on any violation. The caller checks presence first, so
 * the "required" wording can stay specific to each variable.
 *
 * The loopback exception (`localhost` / `127.0.0.1`) is a potentially-trustworthy origin — the same
 * carve-out that lets Secure cookies work over `http://localhost` — and a real production value is
 * never loopback, so it keeps a production build e2e-testable without weakening the real-host rule.
 */
export function validatedHttpOrigin(value: string, envName: string): string {
  const parsed = new URL(value);
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username.length > 0 ||
    parsed.password.length > 0 ||
    parsed.pathname !== "/" ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error(`${envName} must be an HTTP(S) origin without credentials or a path.`);
  }

  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:" && !isLoopback) {
    throw new Error(`${envName} must use HTTPS in production.`);
  }

  return parsed.origin;
}
