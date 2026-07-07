import { AppErrors } from '../errors/app-exception';

/** Keyset cursor payload — the sort keys of the last item on a page. */
export type CursorPayload = Record<string, string | number>;

function isCursorPayload(value: unknown): value is CursorPayload {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  for (const entry of Object.values(value)) {
    if (typeof entry !== 'string' && typeof entry !== 'number') {
      return false;
    }
  }
  return true;
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw AppErrors.badCursor();
  }
  if (!isCursorPayload(parsed)) {
    throw AppErrors.badCursor();
  }
  return parsed;
}

/** Convenience for the common id-only cursor. */
export function decodeCursorId(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  const value = decodeCursor(cursor).id;
  if (typeof value !== 'string') {
    throw AppErrors.badCursor();
  }
  return value;
}
