/** Encode/validate the `returnTo` path carried through OAuth via the `state` param. */

function isSafeRelativePath(path: string): boolean {
  return /^\/(?!\/)/.test(path);
}

export function encodeReturnTo(returnTo: string): string {
  const safe = isSafeRelativePath(returnTo) ? returnTo : '/';
  return Buffer.from(safe, 'utf8').toString('base64url');
}

export function decodeReturnTo(state: unknown): string {
  if (typeof state !== 'string' || state.length === 0) return '/';
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    return isSafeRelativePath(decoded) ? decoded : '/';
  } catch {
    return '/';
  }
}
