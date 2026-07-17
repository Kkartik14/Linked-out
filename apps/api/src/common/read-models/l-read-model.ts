import type { ReactionType, Visibility } from '@linkedout/contracts';
import { Prisma } from '@linkedout/db';

import { USER_SUMMARY_SELECT } from '../mappers/user-summary.mapper';

export const L_AUTHOR_INCLUDE = {
  author: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.LInclude;

export type LWithAuthor = Prisma.LGetPayload<{ include: typeof L_AUTHOR_INCLUDE }>;

export interface LViewerContext {
  reactions: ReactionType[];
  canEdit: boolean;
}

export interface LAudiencePolicy {
  visibilities: Visibility[];
  includeAnonymous: boolean;
}

/** One privacy policy for owner-scoped L lists, independent of transport version. */
export function lAudiencePolicy(
  viewerId: string | undefined,
  ownerId: string,
  isFollowing: boolean,
): LAudiencePolicy {
  if (viewerId === ownerId) {
    return {
      visibilities: ['PUBLIC', 'FOLLOWERS', 'PRIVATE'],
      includeAnonymous: true,
    };
  }
  return {
    visibilities: isFollowing ? ['PUBLIC', 'FOLLOWERS'] : ['PUBLIC'],
    includeAnonymous: false,
  };
}

/** Groups persistence rows once so every card surface builds identical viewer context. */
export function groupViewerReactions(
  rows: ReadonlyArray<{ lId: string; type: ReactionType }>,
): Map<string, ReactionType[]> {
  const grouped = new Map<string, ReactionType[]>();
  for (const row of rows) {
    const reactions = grouped.get(row.lId);
    if (reactions) reactions.push(row.type);
    else grouped.set(row.lId, [row.type]);
  }
  return grouped;
}

export function mapLRows<T>(
  rows: LWithAuthor[],
  viewerId: string | undefined,
  reactions: ReadonlyMap<string, ReactionType[]>,
  mapper: (row: LWithAuthor, viewer: LViewerContext) => T,
): T[] {
  return rows.map((row) =>
    mapper(row, {
      reactions: reactions.get(row.id) ?? [],
      canEdit: viewerId === row.authorId,
    }),
  );
}
