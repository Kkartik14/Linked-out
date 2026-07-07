import { ulid } from 'ulid';

import { Prisma } from '../generated/client';

/**
 * Models that have no scalar `id` column (composite PK or none) — never inject a ULID.
 */
const MODELS_WITHOUT_ULID: ReadonlySet<string> = new Set(['CollectionL', 'VerificationToken']);

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

/**
 * Assigns a time-sortable ULID to every created row that lacks an `id`. Applied via
 * `$extends`, so no service or repository ever generates an id by hand.
 */
export const ulidExtension = Prisma.defineExtension({
  name: 'ulid-ids',
  query: {
    $allModels: {
      create({ model, args, query }) {
        if (!MODELS_WITHOUT_ULID.has(model)) {
          assignUlid(args.data);
        }
        return query(args);
      },
      createMany({ model, args, query }) {
        if (!MODELS_WITHOUT_ULID.has(model) && args.data !== undefined) {
          assignUlidToRows(args.data);
        }
        return query(args);
      },
      createManyAndReturn({ model, args, query }) {
        if (!MODELS_WITHOUT_ULID.has(model) && args.data !== undefined) {
          assignUlidToRows(args.data);
        }
        return query(args);
      },
      upsert({ model, args, query }) {
        if (!MODELS_WITHOUT_ULID.has(model)) {
          assignUlid(args.create);
        }
        return query(args);
      },
    },
  },
});
