import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { USER_SUMMARY_SELECT } from '../../common/mappers/user-summary.mapper';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

const COLLECTION_INCLUDE = {
  owner: { select: USER_SUMMARY_SELECT },
  _count: { select: { ls: true } },
} satisfies Prisma.CollectionInclude;

export type CollectionWithMeta = Prisma.CollectionGetPayload<{
  include: {
    owner: { select: { id: true; username: true; name: true; image: true; status: true } };
    _count: { select: { ls: true } };
  };
}>;

@Injectable()
export class CollectionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, title: string, slug: string): Promise<CollectionWithMeta> {
    return this.prisma.db.$transaction(async (tx) => {
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

  update(id: string, title: string, slug: string): Promise<CollectionWithMeta> {
    return this.prisma.db.collection.update({
      where: { id },
      data: { title, slug },
      include: COLLECTION_INCLUDE,
    });
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

  async addL(collectionId: string, lId: string, position: number): Promise<void> {
    await this.prisma.db.collectionL.upsert({
      where: { collectionId_lId: { collectionId, lId } },
      create: { collectionId, lId, position },
      update: { position },
    });
  }

  async removeL(collectionId: string, lId: string): Promise<void> {
    await this.prisma.db.collectionL.deleteMany({ where: { collectionId, lId } });
  }

  async slugTaken(ownerId: string, slug: string): Promise<boolean> {
    const existing = await this.prisma.db.collection.findUnique({
      where: { ownerId_slug: { ownerId, slug } },
      select: { id: true },
    });
    return existing !== null;
  }
}
