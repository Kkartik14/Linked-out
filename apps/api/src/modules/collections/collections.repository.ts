import { Injectable } from '@nestjs/common';
import { Prisma, type Visibility } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { USER_SUMMARY_SELECT } from '../../common/mappers/user-summary.mapper';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

const COLLECTION_INCLUDE = {
  owner: { select: USER_SUMMARY_SELECT },
  _count: { select: { ls: true } },
} satisfies Prisma.CollectionInclude;

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
   * Adds or moves an L, then rewrites the collection's positions as a dense 0..n-1
   * sequence. Storing the whole order (rather than only the touched row) is what makes
   * `position` authoritative: without it, two rows can share a position and the final
   * order silently falls back to the `lId` tiebreak in `orderedLIds`.
   *
   * `position === undefined` appends, and is a no-op for an L that is already a member
   * (the idempotent `PUT` of contract §4.8). An out-of-range position clamps to the ends.
   *
   * This is a read-modify-write over the whole member set, so it takes a row lock on the
   * owning Collection first. Concurrent adds then queue instead of aborting each other,
   * which is what SERIALIZABLE would do to every writer but the first.
   */
  async addL(collectionId: string, lId: string, position: number | undefined): Promise<void> {
    let attempt = 0;
    while (true) {
      try {
        await this.prisma.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "id" FROM "Collection" WHERE "id" = ${collectionId} FOR UPDATE`;

          const rows = await tx.collectionL.findMany({
            where: { collectionId },
            select: { lId: true },
            orderBy: [{ position: 'asc' }, { lId: 'asc' }],
          });
          const order = rows.map((row) => row.lId);
          const currentIndex = order.indexOf(lId);

          if (position === undefined) {
            if (currentIndex !== -1) return;
            order.push(lId);
          } else {
            if (currentIndex !== -1) order.splice(currentIndex, 1);
            order.splice(Math.min(Math.max(position, 0), order.length), 0, lId);
          }

          if (currentIndex === -1) {
            await tx.collectionL.create({
              data: { collectionId, lId, position: order.indexOf(lId) },
              select: { lId: true },
            });
          }

          for (const [index, id] of order.entries()) {
            await tx.collectionL.update({
              where: { collectionId_lId: { collectionId, lId: id } },
              data: { position: index },
              select: { lId: true },
            });
          }
        });
        return;
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }

  async removeL(collectionId: string, lId: string): Promise<void> {
    await this.prisma.db.collectionL.deleteMany({ where: { collectionId, lId } });
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
