import type { CsrfRejection } from "./csrf";

/** Emit a query- and credential-free security event suitable for centralized log alerting. */
export function logCsrfRejection(request: Request, reason: CsrfRejection): void {
  console.warn("security_rejection", {
    code: "CSRF_REJECTED",
    method: request.method.toUpperCase(),
    path: new URL(request.url).pathname,
    reason,
  });
}
