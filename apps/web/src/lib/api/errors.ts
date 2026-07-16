import type { FieldError } from "@linkedout/contracts";

/** A non-2xx response, decoded from the standard error envelope (contract §1.7). */
export class ApiError extends Error {
  readonly status: number;
  /** Stable machine string — switch on this, not on `message`. */
  readonly code: string;
  /** Present on VALIDATION_ERROR: per-field problems. */
  readonly details?: FieldError[];
  /** Server-directed delay for RATE_LIMITED responses. */
  readonly retryAfterMs?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    details?: FieldError[],
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

/**
 * Flatten a VALIDATION_ERROR into a `{ field: message }` map for form libraries.
 * First message per field wins.
 */
export function fieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isApiError(err) || !err.details) return out;
  for (const d of err.details) {
    if (!(d.field in out)) out[d.field] = d.message;
  }
  return out;
}

/** A user-safe message for any thrown value. */
export function errorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (isApiError(err)) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}
