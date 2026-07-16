import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';
import type { FeedSort, LCategory, LType, ReactionType, Visibility } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
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

const AUTHOR_INCLUDE = {
  author: { select: { id: true, username: true, name: true, image: true, status: true } },
} satisfies Prisma.LInclude;

export type LWithAuthor = Prisma.LGetPayload<{
  include: {
    author: { select: { id: true; username: true; name: true; image: true; status: true } };
  };
}>;

function toPrismaUpdateData(data: UpdateLData): Prisma.LUpdateInput {
  return {
    title: data.title,
    story: data.story,
    type: data.type,
    category: data.category,
    company: data.company,
    tags: data.tags ? { set: data.tags } : undefined,
    eventDate: data.eventDate,
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
  if (sort === 'popular') return encodeCursor({ score: row.popularityScore, id: row.id });
  if (sort === 'helpful') return encodeCursor({ count: row.helpfulCount, id: row.id });
  return encodeCursor({ id: row.id });
}

@Injectable()
export class LsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<LWithAuthor | null> {
    return this.prisma.db.l.findUnique({ where: { id }, include: AUTHOR_INCLUDE });
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
        include: AUTHOR_INCLUDE,
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
    category?: LCategory;
    sort: FeedSort;
    limit: number;
    cursor?: FeedPageCursor;
  }): Promise<EntityPage<LWithAuthor>> {
    const cursorWhere = feedCursorWhere(params.cursor);
    const where: Prisma.LWhereInput = {
      visibility: { in: params.visibilities },
      ...(params.category ? { category: params.category } : {}),
      ...(params.authorIds ? { authorId: { in: params.authorIds } } : {}),
      ...(params.followedByUserId
        ? { author: { followers: { some: { followerId: params.followedByUserId } } } }
        : {}),
      ...(cursorWhere ? { AND: [cursorWhere] } : {}),
    };
    const rows = await this.prisma.db.l.findMany({
      where,
      include: AUTHOR_INCLUDE,
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
      include: AUTHOR_INCLUDE,
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
      select: { id: true, l: { include: AUTHOR_INCLUDE } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(reactions, limit, (row) => encodeCursor({ rid: row.id }));
    return { rows: page.rows.map((r) => r.l), nextCursor: page.nextCursor };
  }

  /** Journey timeline ordered by COALESCE(eventDate, createdAt) ascending (raw for the coalesce). */
  async journey(params: {
    authorId: string;
    visibilities: Visibility[];
    includeAnonymous: boolean;
    limit: number;
    cursor?: JourneyPageCursor;
  }): Promise<EntityPage<LWithAuthor>> {
    let cursorClause = Prisma.empty;
    const anonymityClause = params.includeAnonymous ? Prisma.empty : Prisma.sql`AND "isAnonymous" = false`;
    if (params.cursor) {
      cursorClause = Prisma.sql`AND (COALESCE("eventDate", "createdAt"), "id") > (${params.cursor.date}::timestamp, ${params.cursor.id})`;
    }
    const idRows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "L"
      WHERE "authorId" = ${params.authorId}
        AND "visibility"::text IN (${Prisma.join(params.visibilities)})
        ${anonymityClause}
        ${cursorClause}
      ORDER BY COALESCE("eventDate", "createdAt") ASC, "id" ASC
      LIMIT ${params.limit + 1}
    `;
    const ids = idRows.map((r) => r.id);
    const hydrated = await this.hydrateOrdered(ids);
    return buildPage(hydrated, params.limit, (row) =>
      encodeCursor({ date: (row.eventDate ?? row.createdAt).toISOString(), id: row.id }),
    );
  }

  /** Fetch Ls by id and return them in the given id order. */
  async hydrateOrdered(ids: string[]): Promise<LWithAuthor[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.db.l.findMany({
      where: { id: { in: ids } },
      include: AUTHOR_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered: LWithAuthor[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) ordered.push(row);
    }
    return ordered;
  }

  /** Fetch visible Ls by id in the requested order, with visibility enforced in SQL. */
  async hydrateVisibleOrdered(
    ids: string[],
    viewerId: string | undefined,
  ): Promise<LWithAuthor[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.db.l.findMany({
      where: {
        id: { in: ids },
        OR: [
          { visibility: 'PUBLIC' },
          ...(viewerId
            ? [
                { authorId: viewerId },
                {
                  visibility: 'FOLLOWERS' as const,
                  author: { followers: { some: { followerId: viewerId } } },
                },
              ]
            : []),
        ],
      },
      include: AUTHOR_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered: LWithAuthor[] = [];
    for (const id of ids) {
      const row = byId.get(id);
      if (row) ordered.push(row);
    }
    return ordered;
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
              include: AUTHOR_INCLUDE,
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

            const countedReactions = await tx.reaction.count({
              where: {
                lId: id,
                type: plan.countedReactionReputation.reactionType,
                userId: { not: plan.countedReactionReputation.excludeUserId },
              },
            });
            const reputation = { ...plan.reputationByType[existing.type] };
            if (countedReactions > 0) {
              const effect = plan.countedReactionReputation;
              reputation[effect.reputationField] =
                (reputation[effect.reputationField] ?? 0) +
                countedReactions * effect.pointsPerReaction;
            }

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
  if (delta.buildersHelped !== undefined) {
    update.buildersHelped = { increment: sign * delta.buildersHelped };
  }
  if (delta.storiesShared !== undefined) {
    update.storiesShared = { increment: sign * delta.storiesShared };
  }
  if (delta.lessonsShared !== undefined) {
    update.lessonsShared = { increment: sign * delta.lessonsShared };
  }
  return update;
}
