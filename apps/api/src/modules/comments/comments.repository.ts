import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';
import type {
  CommentCounterDelta,
  CommentCreatePlan,
  CommentDeletePlan,
} from './comments.plan';

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
  parentId: string | null;
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

@Injectable()
export class CommentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMeta(id: string): Promise<CommentMeta | null> {
    return this.prisma.db.comment.findUnique({
      where: { id },
      select: { id: true, lId: true, authorId: true, parentId: true },
    });
  }

  async create(plan: CommentCreatePlan): Promise<CommentWithMeta | null> {
    return this.prisma.db.$transaction(async (tx) => {
      // Every comment write already updates this counter row. Take its lock first so
      // membership changes and the denormalized count have one serialization order.
      // In particular, a reply cannot appear between a parent delete's reply-count read
      // and its cascade.
      const lockedL = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id" FROM "L" WHERE "id" = ${plan.comment.lId} FOR UPDATE
      `;
      if (!lockedL[0]) return null;
      if (plan.comment.parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: plan.comment.parentId },
          select: { lId: true, parentId: true },
        });
        if (!parent || parent.lId !== plan.comment.lId || parent.parentId !== null) return null;
      }

      const comment = await tx.comment.create({
        data: plan.comment,
        include: COMMENT_INCLUDE,
      });
      await tx.l.update({
        where: { id: plan.comment.lId },
        data: applyCommentCounters(plan.lCounters),
        select: { id: true },
      });
      if (plan.notification) {
        await tx.notification.create({
          data: plan.notification.record,
          select: { id: true },
        });
      }
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

  /** Delete a comment and decrement by its exact one-level subtree (replies cascade). */
  async delete(plan: CommentDeletePlan): Promise<void> {
    let attempt = 0;
    while (true) {
      try {
        await this.prisma.db.$transaction(async (tx) => {
          const candidate = await tx.comment.findUnique({
            where: { id: plan.commentId },
            select: { lId: true },
          });
          if (!candidate) return;
          await tx.$queryRaw`SELECT "id" FROM "L" WHERE "id" = ${candidate.lId} FOR UPDATE`;
          // Re-read after waiting for the L lock. A preceding reply/delete transaction may
          // have changed the one-level subtree while this transaction was queued.
          const comment = await tx.comment.findUnique({
            where: { id: plan.commentId },
            select: { lId: true, _count: { select: { replies: true } } },
          });
          if (!comment) return;
          // Threading is deliberately one level deep, so the deleted subtree is the
          // comment itself plus its direct replies. Avoid two full-L COUNT(*) scans.
          const removed = 1 + comment._count.replies;
          await tx.comment.delete({ where: { id: plan.commentId }, select: { id: true } });
          await tx.l.update({
            where: { id: comment.lId },
            data: applyCommentCounters(plan.perDeletedCounters, removed),
            select: { id: true },
          });
        });
        return;
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }
}

/** Mechanical scaling/translation of an already-decided domain counter effect. */
function applyCommentCounters(
  delta: CommentCounterDelta,
  scale = 1,
): Prisma.LUpdateInput {
  const commentCount = delta.commentCount * scale;
  const popularityScore = delta.popularityScore * scale;
  return {
    commentCount: commentCount < 0 ? { decrement: -commentCount } : { increment: commentCount },
    popularityScore:
      popularityScore < 0
        ? { decrement: -popularityScore }
        : { increment: popularityScore },
  };
}
