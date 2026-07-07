import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

const COMMENT_INCLUDE = {
  author: { select: { id: true, username: true, name: true, image: true, status: true } },
  _count: { select: { replies: true } },
} satisfies Prisma.CommentInclude;

export type CommentWithMeta = Prisma.CommentGetPayload<{
  include: {
    author: { select: { id: true; username: true; name: true; image: true; status: true } };
    _count: { select: { replies: true } };
  };
}>;

export interface CommentMeta {
  id: string;
  lId: string;
  authorId: string;
}

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMeta(id: string): Promise<CommentMeta | null> {
    return this.prisma.db.comment.findUnique({
      where: { id },
      select: { id: true, lId: true, authorId: true },
    });
  }

  async create(input: {
    authorId: string;
    lId: string;
    body: string;
    parentId: string | null;
  }): Promise<CommentWithMeta> {
    return this.prisma.db.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          authorId: input.authorId,
          lId: input.lId,
          body: input.body,
          parentId: input.parentId,
        },
        include: COMMENT_INCLUDE,
      });
      await tx.l.update({
        where: { id: input.lId },
        data: { commentCount: { increment: 1 } },
        select: { id: true },
      });
      return comment;
    });
  }

  async listTopLevel(
    lId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<CommentWithMeta>> {
    const rows = await this.prisma.db.comment.findMany({
      where: { lId, parentId: null, ...(cursorId ? { id: { gt: cursorId } } : {}) },
      include: COMMENT_INCLUDE,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
  }

  async listReplies(
    parentId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<CommentWithMeta>> {
    const rows = await this.prisma.db.comment.findMany({
      where: { parentId, ...(cursorId ? { id: { gt: cursorId } } : {}) },
      include: COMMENT_INCLUDE,
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    return buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
  }

  /** Delete a comment (replies cascade) and recompute the L's comment count. */
  async delete(id: string): Promise<void> {
    await this.prisma.db.$transaction(async (tx) => {
      const comment = await tx.comment.findUnique({ where: { id }, select: { lId: true } });
      if (!comment) return;
      await tx.comment.delete({ where: { id }, select: { id: true } });
      const remaining = await tx.comment.count({ where: { lId: comment.lId } });
      await tx.l.update({
        where: { id: comment.lId },
        data: { commentCount: remaining },
        select: { id: true },
      });
    });
  }
}
