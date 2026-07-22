import { monotonicFactory } from 'ulid';

import { Prisma } from '../generated/client';

/**
 * Monotonic, not the plain `ulid()`: within a single millisecond the plain factory
 * randomizes the low 80 bits, so rows created in the same tick sort arbitrarily. Every
 * list in the API keysets on `ORDER BY id`, and contract.md §1.3 promises "sort by id asc
 * = oldest-first" — that only holds if ids strictly increase. The factory increments the
 * random component instead. Across processes the guarantee degrades to the millisecond.
 */
const ulid = monotonicFactory();

/**
 * Models that have no scalar `id` column (composite PK or none) — never inject a ULID.
 */
const MODELS_WITHOUT_ULID: ReadonlySet<string> = new Set([
  'AvatarDeletionClaim',
  'DailyLSelection',
  'EmailOtpOutbox',
  'PasswordCredential',
  'RateLimitBucket',
  'VerificationToken',
]);

export function modelUsesUlid(model: string): boolean {
  return !MODELS_WITHOUT_ULID.has(model);
}

/**
 * ORM boundary: Prisma types write-`data` as a broad union, so we narrow at runtime and
 * only touch a plain object that is missing an `id`. This is the one sanctioned place we
 * accept `unknown` (per CLAUDE.md §1 — a true system boundary with a runtime check).
 */
function assignUlid(target: unknown): void {
  if (target !== null && typeof target === 'object' && !Array.isArray(target)) {
    const record = target as { id?: string | null };
    if (record.id === undefined || record.id === null) {
      record.id = ulid();
    }
  }
}

function assignUlidToRows(data: unknown): void {
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    assignUlid(row);
  }
}

/** The nested-write keys that create rows. `connect`/`set`/`disconnect` create nothing. */
const NESTED_CREATE_KEYS = ['create', 'createMany', 'connectOrCreate', 'upsert'] as const;

/**
 * These hooks receive only the top-level model, so a row created through a *relation* — say
 * `l.create({ data: { comments: { create: … } } })` — is never seen here and keeps the
 * `@default(cuid())` the schema carries as a type-level fallback. That fails silently and
 * badly: `'0' < 'c'`, so a single cuid row sorts ahead of every ULID forever, pinning itself
 * to the top of the `latest` feed and breaking every id-keyset cursor that steps past it.
 *
 * Resolving the nested model would need the DMMF to map each relation field to its target.
 * Rather than carry that, this refuses the write. Nothing in the codebase does nested creates
 * — every child is written through its own repository call — so this forbids a pattern that
 * does not exist rather than removing one that does. No model has a `Json` column, so a
 * `create` key inside write data can only be a relation.
 */
function assertNoNestedCreate(model: string, data: unknown): void {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) return;
  for (const [field, value] of Object.entries(data)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
    const used = NESTED_CREATE_KEYS.filter((key) => key in value);
    if (used.length > 0) {
      throw new Error(
        `${model}.${field} uses a nested "${used.join('"/"')}" write. Ids are assigned by the ` +
          `ULID client extension, which only sees top-level creates — the nested row would ` +
          `fall back to @default(cuid()) and sort before every ULID. Write the related row ` +
          `through its own repository call.`,
      );
    }
  }
}

/**
 * Assigns a time-sortable ULID to every row created by a top-level `create`, `createMany`,
 * `createManyAndReturn`, or `upsert` that lacks an `id`, so no service or repository ever
 * generates an id by hand. Nested relation creates are refused rather than silently missed —
 * see `assertNoNestedCreate`.
 */
export const ulidExtension = Prisma.defineExtension({
  name: 'ulid-ids',
  query: {
    $allModels: {
      create({ model, args, query }) {
        assertNoNestedCreate(model, args.data);
        if (modelUsesUlid(model)) {
          assignUlid(args.data);
        }
        return query(args);
      },
      createMany({ model, args, query }) {
        // `createMany` takes flat rows only — Prisma rejects nested writes in it — so the
        // nested-create check would have nothing to find.
        if (modelUsesUlid(model) && args.data !== undefined) {
          assignUlidToRows(args.data);
        }
        return query(args);
      },
      createManyAndReturn({ model, args, query }) {
        if (modelUsesUlid(model) && args.data !== undefined) {
          assignUlidToRows(args.data);
        }
        return query(args);
      },
      upsert({ model, args, query }) {
        assertNoNestedCreate(model, args.create);
        if (modelUsesUlid(model)) {
          assignUlid(args.create);
        }
        return query(args);
      },
    },
  },
});
