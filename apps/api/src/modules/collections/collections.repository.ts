import { Injectable } from '@nestjs/common';
import { Prisma, type ExtendedPrismaClient, type Visibility } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { USER_SUMMARY_SELECT } from '../../common/mappers/user-summary.mapper';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

const COLLECTION_INCLUDE = {
  owner: { select: USER_SUMMARY_SELECT },
  _count: { select: { ls: true } },
} satisfies Prisma.CollectionInclude;

const POSITION_GAP = 1024;
const POSTGRES_INT_MIN = -2_147_483_648;
const POSTGRES_INT_MAX = 2_147_483_647;

type CollectionTransaction = Omit<
  ExtendedPrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function shiftedRank(position: number, delta: number): number | null {
  const rank = position + delta;
  return rank >= POSTGRES_INT_MIN && rank <= POSTGRES_INT_MAX ? rank : null;
}

export class CollectionSlugConflictError extends Error {
  constructor() {
    super('Collection slug already exists.');
    this.name = 'CollectionSlugConflictError';
  }
}

export type CollectionWithMeta = Prisma.CollectionGetPayload<{
  include: {
    owner: { select: { id: true; username: true; name: true; image: true; status: true } };
    _count: { select: { ls: true } };
  };
}>;

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, title: string, slug: string): Promise<CollectionWithMeta> {
    try {
      return await this.prisma.db.$transaction(async (tx) => {
        const collection = await tx.collection.create({
          data: { ownerId, title, slug },
          include: COLLECTION_INCLUDE,
        });
        await tx.user.update({
          where: { id: ownerId },
          data: { collectionsCreated: { increment: 1 } },
          select: { id: true },
        });
        return collection;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CollectionSlugConflictError();
      }
      throw error;
    }
  }

  findById(id: string): Promise<CollectionWithMeta | null> {
    return this.prisma.db.collection.findUnique({ where: { id }, include: COLLECTION_INCLUDE });
  }

  findOwner(id: string): Promise<{ id: string; ownerId: string } | null> {
    return this.prisma.db.collection.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
  }

  async update(id: string, title: string, slug: string): Promise<CollectionWithMeta> {
    try {
      return await this.prisma.db.collection.update({
        where: { id },
        data: { title, slug },
        include: COLLECTION_INCLUDE,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new CollectionSlugConflictError();
      }
      throw error;
    }
  }

  async delete(id: string, ownerId: string): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      await tx.collection.delete({ where: { id }, select: { id: true } });
      await tx.user.update({
        where: { id: ownerId },
        data: { collectionsCreated: { decrement: 1 } },
        select: { id: true },
      });
    });
  }

  async listByOwner(
    ownerId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<CollectionWithMeta>> {
    const rows = await this.prisma.db.collection.findMany({
      where: { ownerId, ...(cursorId ? { id: { lt: cursorId } } : {}) },
      include: COLLECTION_INCLUDE,
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    return buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
  }

  async visibleLCounts(
    collectionIds: string[],
    visibilities: Visibility[],
  ): Promise<Map<string, number>> {
    if (collectionIds.length === 0) return new Map();
    const rows = await this.prisma.db.collectionL.groupBy({
      by: ['collectionId'],
      where: { collectionId: { in: collectionIds }, l: { visibility: { in: visibilities } } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.collectionId, row._count._all]));
  }

  async orderedLIds(collectionId: string): Promise<string[]> {
    const rows = await this.prisma.db.collectionL.findMany({
      where: { collectionId },
      select: { lId: true },
      orderBy: [{ position: 'asc' }, { lId: 'asc' }],
    });
    return rows.map((row) => row.lId);
  }

  lOwner(lId: string): Promise<{ authorId: string } | null> {
    return this.prisma.db.l.findUnique({ where: { id: lId }, select: { authorId: true } });
  }

  /**
   * Adds or moves one L using gapped integer ranks. The request's `position` remains an
   * ordinal index, but the stored value is a private ordering key. A normal insert/move
   * reads only the two neighbours and writes only the touched membership. If repeated
   * midpoint inserts exhaust a gap, the collection is re-ranked once and the operation
   * retries; that exceptional O(n) repair replaces the previous O(n) writes on every PUT.
   *
   * `position === undefined` appends, and is a no-op for an L that is already a member
   * (the idempotent `PUT` of contract §4.8). An out-of-range position clamps to the ends.
   * The Collection row lock serializes rank allocation for concurrent writers.
   */
  async addL(collectionId: string, lId: string, position: number | undefined): Promise<void> {
    let attempt = 0;
    while (true) {
      try {
        await this.prisma.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Collection" WHERE "id" = ${collectionId} FOR UPDATE`;

          const existing = await tx.collectionL.findUnique({
            where: { collectionId_lId: { collectionId, lId } },
            select: { position: true },
          });
          if (position === undefined && existing) return;

          const requestedIndex = position;
          let rank = await this.rankForOrdinal(tx, collectionId, lId, requestedIndex);
          if (rank === null) {
            await this.rebalanceRanks(tx, collectionId);
            rank = await this.rankForOrdinal(tx, collectionId, lId, requestedIndex);
          }
          if (rank === null) throw new Error('Collection rank rebalance did not create a gap.');

          await tx.collectionL.upsert({
            where: { collectionId_lId: { collectionId, lId } },
            create: { collectionId, lId, position: rank },
            update: { position: rank },
            select: { lId: true },
          });
        });
        return;
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }

  private async rankForOrdinal(
    tx: CollectionTransaction,
    collectionId: string,
    movingLId: string,
    requestedIndex: number | undefined,
  ): Promise<number | null> {
    const where = { collectionId, lId: { not: movingLId } };
    if (requestedIndex === undefined) {
      const last = await tx.collectionL.findFirst({
        where,
        select: { position: true },
        orderBy: [{ position: 'desc' }, { lId: 'desc' }],
      });
      return last ? shiftedRank(last.position, POSITION_GAP) : 0;
    }

    const remaining = await tx.collectionL.count({ where });
    const index = Math.min(Math.max(requestedIndex, 0), remaining);
    const start = Math.max(0, index - 1);
    const window = await tx.collectionL.findMany({
      where,
      select: { position: true },
      orderBy: [{ position: 'asc' }, { lId: 'asc' }],
      skip: start,
      take: 2,
    });
    const previous = index > 0 ? window[0]?.position : undefined;
    const next = index > 0 ? window[1]?.position : window[0]?.position;

    if (previous === undefined && next === undefined) return 0;
    if (previous === undefined) return shiftedRank(next!, -POSITION_GAP);
    if (next === undefined) return shiftedRank(previous, POSITION_GAP);
    if (next - previous <= 1) return null;
    return previous + Math.floor((next - previous) / 2);
  }

  private async rebalanceRanks(tx: CollectionTransaction, collectionId: string): Promise<void> {
    const members = await tx.collectionL.findMany({
      where: { collectionId },
      select: { lId: true },
      orderBy: [{ position: 'asc' }, { lId: 'asc' }],
    });
    for (const [index, member] of members.entries()) {
      await tx.collectionL.update({
        where: { collectionId_lId: { collectionId, lId: member.lId } },
        data: { position: index * POSITION_GAP },
        select: { lId: true },
      });
    }
  }

  async removeL(collectionId: string, lId: string): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      // Rank allocation and removal must observe one serialized membership order.
      // Without the same row lock, a remove can race rankForOrdinal's count/window reads.
      await tx.$queryRaw`SELECT "id" FROM "Collection" WHERE "id" = ${collectionId} FOR UPDATE`;
      await tx.collectionL.deleteMany({ where: { collectionId, lId } });
    });
  }

  async slugTaken(ownerId: string, slug: string, exceptCollectionId?: string): Promise<boolean> {
    const existing = await this.prisma.db.collection.findFirst({
      where: {
        ownerId,
        slug,
        ...(exceptCollectionId ? { id: { not: exceptCollectionId } } : {}),
      },
      select: { id: true },
    });
    return existing !== null;
  }
}
