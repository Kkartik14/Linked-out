import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type LType,
  type LCategory,
  type ReactionType,
  type Visibility,
} from '@linkedout/db';
import type { FeedSort } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

const AUTHOR_INCLUDE = {
  author: { select: { id: true, username: true, name: true, image: true, status: true } },
} satisfies Prisma.LInclude;

export type LWithAuthor = Prisma.LGetPayload<{
  include: {
    author: { select: { id: true; username: true; name: true; image: true; status: true } };
  };
}>;

/** Normalized write payload for an L (nullables resolved). */
export interface WriteLData {
  title: string;
  story: string;
  lessonLearned: string | null;
  type: LType;
  category: LCategory | null;
  company: string | null;
  tags: string[];
  eventDate: Date | null;
  visibility: Visibility;
  isAnonymous: boolean;
}

export type ReputationField = 'lsShared' | 'storiesShared' | 'lessonsShared' | 'buildersHelped';
export type ReputationDelta = Partial<Record<ReputationField, number>>;
export type OwnedLWriteResult<T> =
  | { status: 'ok'; row: T }
  | { status: 'not_found' }
  | { status: 'not_owner' };

type BuildUpdateData = (effectiveType: LType) => Prisma.LUpdateInput;
type TypeChangeDelta = (from: LType, to: LType | undefined) => ReputationDelta;
type DeleteReputation = (type: LType) => ReputationDelta;

function cursorString(value: string | number | undefined): string {
  if (typeof value !== 'string') throw AppErrors.badCursor();
  return value;
}

function cursorNumber(value: string | number | undefined): number {
  if (typeof value !== 'number') throw AppErrors.badCursor();
  return value;
}

function feedOrderBy(sort: FeedSort): Prisma.LOrderByWithRelationInput[] {
  if (sort === 'trending') return [{ trendingScore: 'desc' }, { id: 'desc' }];
  if (sort === 'helpful') return [{ helpfulCount: 'desc' }, { id: 'desc' }];
  return [{ id: 'desc' }];
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

function feedCursorWhere(sort: FeedSort, cursor: string | undefined): Prisma.LWhereInput | null {
  if (cursor === undefined) return null;
  const payload = decodeCursor(cursor);
  if (sort === 'trending') {
    const score = cursorNumber(payload.score);
    const id = cursorString(payload.id);
    return { OR: [{ trendingScore: { lt: score } }, { trendingScore: score, id: { lt: id } }] };
  }
  if (sort === 'helpful') {
    const count = cursorNumber(payload.count);
    const id = cursorString(payload.id);
    return { OR: [{ helpfulCount: { lt: count } }, { helpfulCount: count, id: { lt: id } }] };
  }
  return { id: { lt: cursorString(payload.id) } };
}

function feedMakeCursor(sort: FeedSort, row: LWithAuthor): string {
  if (sort === 'trending') return encodeCursor({ score: row.trendingScore, id: row.id });
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
    cursor?: string;
  }): Promise<EntityPage<LWithAuthor>> {
    const cursorWhere = feedCursorWhere(params.sort, params.cursor);
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
    type?: LType;
    limit: number;
    cursor?: string;
  }): Promise<EntityPage<LWithAuthor>> {
    const cursorId = params.cursor ? cursorString(decodeCursor(params.cursor).id) : undefined;
    const rows = await this.prisma.db.l.findMany({
      where: {
        authorId: params.authorId,
        visibility: { in: params.visibilities },
        ...(params.type ? { type: params.type } : {}),
        ...(cursorId ? { id: { lt: cursorId } } : {}),
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
    cursor: string | undefined,
  ): Promise<EntityPage<LWithAuthor>> {
    const cursorReactionId = cursor ? cursorString(decodeCursor(cursor).rid) : undefined;
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
    limit: number;
    cursor?: string;
  }): Promise<EntityPage<LWithAuthor>> {
    let cursorClause = Prisma.empty;
    if (params.cursor) {
      const payload = decodeCursor(params.cursor);
      const date = cursorString(payload.date);
      const id = cursorString(payload.id);
      cursorClause = Prisma.sql`AND (COALESCE("eventDate", "createdAt"), "id") > (${date}::timestamp, ${id})`;
    }
    const idRows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "L"
      WHERE "authorId" = ${params.authorId}
        AND "visibility"::text IN (${Prisma.join(params.visibilities)})
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
    requestedType: LType | undefined,
    buildData: BuildUpdateData,
    typeChangeDelta: TypeChangeDelta,
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

            const effectiveType = requestedType ?? existing.type;
            const reputation = typeChangeDelta(existing.type, requestedType);
            const row = await tx.l.update({
              where: { id },
              data: buildData(effectiveType),
              include: AUTHOR_INCLUDE,
            });
            if (Object.keys(reputation).length > 0) {
              await tx.user.update({
                where: { id: authorId },
                data: incrementReputation(reputation),
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
    deleteReputation: DeleteReputation,
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

            const helpfulFromOthers = await tx.reaction.count({
              where: { lId: id, type: 'HELPFUL', userId: { not: authorId } },
            });
            const reputation = deleteReputation(existing.type);
            if (helpfulFromOthers > 0) reputation.buildersHelped = helpfulFromOthers;

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
