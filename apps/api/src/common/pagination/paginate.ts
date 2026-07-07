import type { Paginated } from '@linkedout/contracts';

/** A page of raw entities plus the opaque cursor to the next page. */
export interface EntityPage<T> {
  rows: T[];
  nextCursor: string | null;
}

/**
 * Repositories over-fetch by one row (`limit + 1`) and pass the result here: if the extra
 * row exists there's a next page, and its cursor is derived from the last kept row.
 */
export function buildPage<T>(
  fetched: T[],
  limit: number,
  makeCursor: (row: T) => string,
): EntityPage<T> {
  const hasMore = fetched.length > limit;
  const rows = hasMore ? fetched.slice(0, limit) : fetched;
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const nextCursor = hasMore && last !== undefined ? makeCursor(last) : null;
  return { rows, nextCursor };
}

/** Maps a raw entity page into the wire `{ data, nextCursor }` envelope. */
export function mapPage<TIn, TOut>(page: EntityPage<TIn>, map: (row: TIn) => TOut): Paginated<TOut> {
  return { data: page.rows.map(map), nextCursor: page.nextCursor };
}
