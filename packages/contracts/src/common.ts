import { z } from 'zod';

/** A ULID — 26-char Crockford base32, time-sortable. Treated as an opaque string. */
export const ulidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$/, 'Invalid id');

/** ISO 8601 UTC timestamp string, as returned in responses. */
export const isoTimestampSchema = z.string();

/**
 * A date on the way *in*. Accepts an ISO 8601 string (or a `Date` from a typed caller)
 * and yields a `Date`. Deliberately not `z.coerce.date()`: that runs `new Date(value)` on
 * anything, so `true` becomes 1970-01-01T00:00:00.001Z and `12345` becomes an epoch offset
 * — both silently persisted. Loose strings like `"1"` are rejected too; only bare ISO
 * dates and ISO datetimes are accepted.
 */
const isoDateInputStringSchema = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

export const dateInputSchema = z
  .union([z.date(), isoDateInputStringSchema])
  .transform((value) => new Date(value));

/**
 * Cursor pagination query. `cursor` is opaque (base64) — never parsed by the client.
 * Factory lets endpoints tune the max/default page size (e.g. journey allows 100).
 */
export function paginationQuerySchema(options?: { defaultLimit?: number; maxLimit?: number }) {
  const defaultLimit = options?.defaultLimit ?? 20;
  const maxLimit = options?.maxLimit ?? 50;
  return z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    cursor: z.string().min(1).optional(),
  });
}

export type PaginationQuery = z.infer<ReturnType<typeof paginationQuerySchema>>;

/** Wraps an item schema in the standard `{ data, nextCursor }` list envelope. */
export function paginatedSchema<TItem extends z.ZodTypeAny>(item: TItem) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

// ─── Strict-input helpers (CONTRACT-01) ────────────────────────────────────────

/**
 * Request **body** objects are `.strict()` (CONTRACT-01A) so a misspelled field (e.g.
 * `visiblity`, `isAnynomous`) is rejected with a 400 instead of being silently stripped —
 * which would otherwise let a privacy field fall back to its permissive default. PATCH bodies
 * also require at least one recognized field via `hasAtLeastOneField`.
 *
 * NOTE: query objects (pagination/feed/search/auth/meta) are NOT yet strict — see
 * `docs/contract-01-status.md` (CONTRACT-01B). Do not claim "all external request objects are
 * strict" until 01B lands.
 */
export const AT_LEAST_ONE_FIELD = 'Provide at least one field to update.';

export function hasAtLeastOneField(value: object): boolean {
  return Object.keys(value).length > 0;
}

// ─── Error envelope (contract.md §1.7) ─────────────────────────────────────────

export const fieldErrorCodeSchema = z.enum([
  'required',
  'too_short',
  'too_long',
  'too_many',
  'invalid_format',
  'invalid_enum',
  'not_a_url',
]);
export type FieldErrorCode = z.infer<typeof fieldErrorCodeSchema>;

export const fieldErrorSchema = z.object({
  field: z.string(),
  code: fieldErrorCodeSchema,
  message: z.string(),
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(fieldErrorSchema).optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
