import { Injectable } from '@nestjs/common';
import { Prisma, type Visibility } from '@linkedout/db';
import type { FeedSort, LType, ReactionType } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
import {
  L_AUTHOR_INCLUDE,
  type LWithAuthor,
} from '../../common/read-models/l-read-model';
import type {
  FeedPageCursor,
  JourneyPageCursor,
  LDeletePlan,
  LUpdatePlans,
  OwnedLWriteResult,
  ReputationDelta,
  UpdateLData,
  WriteLData,
} from './ls.types';

export type { LWithAuthor } from '../../common/read-models/l-read-model';

function toPrismaUpdateData(data: UpdateLData): Prisma.LUpdateInput {
  return {
    title: data.title,
    story: data.story,
    type: data.type,
    visibility: data.visibility,
    isAnonymous: data.isAnonymous,
    resolvedAt: data.resolvedAt,
  };
}

function feedOrderBy(sort: FeedSort): Prisma.LOrderByWithRelationInput[] {
  if (sort === 'popular') return [{ popularityScore: 'desc' }, { id: 'desc' }];
  if (sort === 'helpful') return [{ helpfulCount: 'desc' }, { id: 'desc' }];
  return [{ id: 'desc' }];
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function feedCursorWhere(cursor: FeedPageCursor | undefined): Prisma.LWhereInput | null {
  if (cursor === undefined) return null;
  if (cursor.sort === 'popular') {
    return {
      OR: [
        { popularityScore: { lt: cursor.score } },
        { popularityScore: cursor.score, id: { lt: cursor.id } },
      ],
    };
  }
  if (cursor.sort === 'helpful') {
    return {
      OR: [
        { helpfulCount: { lt: cursor.count } },
        { helpfulCount: cursor.count, id: { lt: cursor.id } },
      ],
    };
  }
  return { id: { lt: cursor.id } };
}

function feedMakeCursor(sort: FeedSort, row: LWithAuthor): string {
  if (sort === 'popular') return encodeCursor({ sort, score: row.popularityScore, id: row.id });
  if (sort === 'helpful') return encodeCursor({ sort, count: row.helpfulCount, id: row.id });
  return encodeCursor({ sort, id: row.id });
}

@Injectable()
export class LsRepository {
  constructor(private readonly prisma: PrismaService) {}

  authorIdByUsername(username: string): Promise<{ id: string } | null> {
    return this.prisma.db.user.findUnique({ where: { username }, select: { id: true } });
  }

  findById(id: string): Promise<LWithAuthor | null> {
    return this.prisma.db.l.findUnique({ where: { id }, include: L_AUTHOR_INCLUDE });
  }

  /** Collection refs an L belongs to (for LDetail). */
  collectionsForL(lId: string): Promise<Array<{ id: string; title: string; slug: string }>> {
    return this.prisma.db.collection
      .findMany({
        where: { ls: { some: { lId } } },
        select: { id: true, title: true, slug: true },
        orderBy: { id: 'desc' },
      });
  }

  async createL(
    authorId: string,
    data: WriteLData,
    reputation: ReputationDelta,
  ): Promise<LWithAuthor> {
    return this.prisma.db.$transaction(async (tx) => {
      const created = await tx.l.create({
        data: { ...data, authorId },
        include: L_AUTHOR_INCLUDE,
      });
      if (Object.keys(reputation).length > 0) {
        await tx.user.update({
          where: { id: authorId },
          data: incrementReputation(reputation),
          select: { id: true },
        });
      }
      return created;
    });
  }

  /** Viewer's own reactions on the given Ls, for card viewer-context. */
  async viewerReactions(
    viewerId: string,
    lIds: string[],
  ): Promise<Array<{ lId: string; type: ReactionType }>> {
    if (lIds.length === 0) return [];
    return this.prisma.db.reaction.findMany({
      where: { userId: viewerId, lId: { in: lIds } },
      select: { lId: true, type: true },
    });
  }

  async feed(params: {
    visibilities: Visibility[];
    authorIds?: string[];
    followedByUserId?: string;
    sort: FeedSort;
    limit: number;
    cursor?: FeedPageCursor;
  }): Promise<EntityPage<LWithAuthor>> {
    const cursorWhere = feedCursorWhere(params.cursor);
    const where: Prisma.LWhereInput = {
      visibility: { in: params.visibilities },
      ...(params.authorIds ? { authorId: { in: params.authorIds } } : {}),
      ...(params.followedByUserId
        ? { author: { followers: { some: { followerId: params.followedByUserId } } } }
        : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    };
    const rows = await this.prisma.db.l.findMany({
      where,
      include: L_AUTHOR_INCLUDE,
      orderBy: feedOrderBy(params.sort),
      take: params.limit + 1,
    });
    return buildPage(rows, params.limit, (row) => feedMakeCursor(params.sort, row));
  }

  async byAuthor(params: {
    authorId: string;
    visibilities: Visibility[];
    includeAnonymous: boolean;
    type?: LType;
    limit: number;
    cursorId?: string;
  }): Promise<EntityPage<LWithAuthor>> {
    const rows = await this.prisma.db.l.findMany({
      where: {
        authorId: params.authorId,
        visibility: { in: params.visibilities },
        ...(params.includeAnonymous ? {} : { isAnonymous: false }),
        ...(params.type ? { type: params.type } : {}),
        ...(params.cursorId ? { id: { lt: params.cursorId } } : {}),
      },
      include: L_AUTHOR_INCLUDE,
      orderBy: { id: 'desc' },
      take: params.limit + 1,
    });
    return buildPage(rows, params.limit, (row) => encodeCursor({ id: row.id }));
  }

  /** Saved (📌) Ls for a viewer, newest-saved first. */
  async savedByUser(
    viewerId: string,
    limit: number,
    cursorReactionId: string | undefined,
  ): Promise<EntityPage<LWithAuthor>> {
    const reactions = await this.prisma.db.reaction.findMany({
      where: {
        userId: viewerId,
        type: 'SAVED',
        l: {
          OR: [
            { visibility: 'PUBLIC' },
            { authorId: viewerId },
            {
              visibility: 'FOLLOWERS',
              author: { followers: { some: { followerId: viewerId } } },
            },
          ],
        },
        ...(cursorReactionId ? { id: { lt: cursorReactionId } } : {}),
      },
      select: { id: true, l: { include: L_AUTHOR_INCLUDE } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(reactions, limit, (row) => encodeCursor({ rid: row.id }));
    return { rows: page.rows.map((r) => r.l), nextCursor: page.nextCursor };
  }

  /** Journey timeline ordered by publication time ascending. */
  async journey(params: {
    authorId: string;
    visibilities: Visibility[];
    includeAnonymous: boolean;
    limit: number;
    cursor?: JourneyPageCursor;
  }): Promise<EntityPage<LWithAuthor>> {
    const cursorWhere: Prisma.LWhereInput | undefined = params.cursor
      ? {
          OR: [
            { createdAt: { gt: new Date(params.cursor.createdAt) } },
            { createdAt: new Date(params.cursor.createdAt), id: { gt: params.cursor.id } },
          ],
        }
      : undefined;
    const rows = await this.prisma.db.l.findMany({
      where: {
        authorId: params.authorId,
        visibility: { in: params.visibilities },
        ...(params.includeAnonymous ? {} : { isAnonymous: false }),
        ...(cursorWhere ? { AND: [cursorWhere] } : {}),
      },
      include: L_AUTHOR_INCLUDE,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: params.limit + 1,
    });
    return buildPage(rows, params.limit, (row) =>
      encodeCursor({ createdAt: row.createdAt.toISOString(), id: row.id }),
    );
  }

  /** Does the viewer follow the author? Used for FOLLOWERS-visibility checks. */
  async viewerFollows(viewerId: string, authorId: string): Promise<boolean> {
    const follow = await this.prisma.db.follow.findUnique({
      where: { followerId_followingId: { followerId: viewerId, followingId: authorId } },
      select: { id: true },
    });
    return follow !== null;
  }

  async updateOwnedL(
    id: string,
    authorId: string,
    plans: LUpdatePlans,
  ): Promise<OwnedLWriteResult<LWithAuthor>> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(
          async (tx) => {
            const existing = await tx.l.findUnique({
              where: { id },
              select: { authorId: true, type: true },
            });
            if (!existing) return { status: 'not_found' };
            if (existing.authorId !== authorId) return { status: 'not_owner' };

            const plan = plans[existing.type];
            const row = await tx.l.update({
              where: { id },
              data: toPrismaUpdateData(plan.data),
              include: L_AUTHOR_INCLUDE,
            });
            if (Object.keys(plan.reputation).length > 0) {
              await tx.user.update({
                where: { id: authorId },
                data: incrementReputation(plan.reputation),
                select: { id: true },
              });
            }
            return { status: 'ok', row };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }

  async deleteOwnedL(
    id: string,
    authorId: string,
    plan: LDeletePlan,
  ): Promise<OwnedLWriteResult<null>> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(
          async (tx) => {
            const existing = await tx.l.findUnique({
              where: { id },
              select: { authorId: true, type: true },
            });
            if (!existing) return { status: 'not_found' };
            if (existing.authorId !== authorId) return { status: 'not_owner' };

            const reputation = plan.reputationByType[existing.type];

            await tx.l.delete({ where: { id }, select: { id: true } });
            if (Object.keys(reputation).length > 0) {
              await tx.user.update({
                where: { id: authorId },
                data: incrementReputation(reputation, -1),
                select: { id: true },
              });
            }
            return { status: 'ok', row: null };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }
}

function incrementReputation(
  delta: ReputationDelta,
  sign: 1 | -1 = 1,
): Prisma.UserUpdateInput {
  const update: Prisma.UserUpdateInput = {};
  if (delta.lsShared !== undefined) update.lsShared = { increment: sign * delta.lsShared };
  if (delta.storiesShared !== undefined) {
    update.storiesShared = { increment: sign * delta.storiesShared };
  }
  if (delta.lessonsShared !== undefined) {
    update.lessonsShared = { increment: sign * delta.lessonsShared };
  }
  return update;
}
