export const AVATAR_PREFIX = 'avatars/';

export function isAvatarListingCursor(key: string): boolean {
  // This is an opaque lexicographic checkpoint, not a deletion key. Accept every legal
  // object name returned by a Prefix=avatars/ listing (including the prefix object itself
  // or control characters) so an unusual key can never make a bounded sweep unresumable.
  return key.startsWith(AVATAR_PREFIX);
}

/** The one coordination primitive shared by profile writes and deletion claims. */
export async function lockAvatarObjectKey<T extends {
  $queryRawUnsafe(query: string, ...values: string[]): Promise<unknown>;
}>(
  tx: T,
  key: string,
): Promise<void> {
  await tx.$queryRawUnsafe(
    'SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))',
    key,
  );
}

export function isSafeAvatarKey(key: string): boolean {
  if (!isAvatarListingCursor(key) || key.length === AVATAR_PREFIX.length) return false;
  const segments = key.split('/');
  return !segments.includes('.') && !segments.includes('..') && !key.includes('\\');
}

/**
 * Resolve a current public avatar URL to its stable, user-owned R2 key.
 * The exact URL is still stored for rendering; the key is the cleanup identity.
 */
export function ownedAvatarObjectKey(
  publicBaseUrl: string,
  userId: string,
  imageUrl: string,
): string | null {
  try {
    const base = new URL(publicBaseUrl);
    const image = new URL(imageUrl);
    const basePath = base.pathname.replace(/\/+$/, '');
    const ownedPathPrefix = `${basePath}/${AVATAR_PREFIX}${userId}/`;
    if (
      image.origin !== base.origin ||
      image.search.length > 0 ||
      image.hash.length > 0 ||
      !image.pathname.startsWith(ownedPathPrefix)
    ) {
      return null;
    }

    const key = image.pathname.slice(basePath.length + 1);
    if (!isSafeAvatarKey(key) || key.slice(`${AVATAR_PREFIX}${userId}/`.length).includes('/')) {
      return null;
    }
    return key;
  } catch {
    return null;
  }
}
