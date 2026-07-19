/**
 * CSRF checks for the one-origin BFF edge (ADR 0001 §4.5; AUTH-07).
 *
 * Once `lo_sid` is a host-only cookie the browser attaches automatically, a cross-site request
 * would carry it too — CORS is not CSRF protection. So before the edge resolves a session for an
 * unsafe method, it verifies the request actually came from our own page: the `Origin` (or, as a
 * fallback, the origin parsed from `Referer`) must be the approved public origin. Safe methods
 * (GET/HEAD/OPTIONS) are exempt because they must never mutate.
 *
 * Pure functions with no framework or environment coupling, so the security decision is unit
 * testable in isolation from the route handler that enforces it.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isSafeMethod(method: string): boolean {
  return SAFE_METHODS.has(method.toUpperCase());
}

/**
 * `application/json` is the only content type this app's browser mutations send (see the API
 * client). Requiring it for a *bodied* request forces a CORS preflight cross-site, which a simple
 * form-based CSRF cannot satisfy.
 */
const APPROVED_CONTENT_TYPES = new Set(["application/json"]);

/**
 * True when a content type is present and is NOT one we accept — the form-submittable types
 * (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) a cross-site CSRF
 * would use. A request with no content type is a bodyless mutation (e.g. a reaction `PUT` or a
 * `DELETE`); those carry no CSRF-able body, so the origin check alone guards them and requiring a
 * content type would wrongly reject them.
 */
export function hasDisallowedContentType(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) return false;
  const essence = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  return !APPROVED_CONTENT_TYPES.has(essence);
}

/**
 * The request's declared origin — from `Origin`, or parsed out of `Referer` when `Origin` is
 * absent (some requests omit it). `null` when neither is present or parseable, which the caller
 * treats as a failed check for an unsafe method.
 */
export function requestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export type CsrfRejection = "origin" | "content-type";

/**
 * The single gate for an unsafe, cookie-authenticated request. Returns the rejection reason, or
 * `null` when the request may proceed. Safe methods always pass.
 */
export function csrfRejection(
  request: Request,
  approvedOrigin: string,
): CsrfRejection | null {
  if (isSafeMethod(request.method)) return null;
  if (requestOrigin(request) !== approvedOrigin) return "origin";
  if (hasDisallowedContentType(request)) return "content-type";
  return null;
}
