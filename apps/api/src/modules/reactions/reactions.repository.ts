import { Injectable } from '@nestjs/common';
import { Prisma, type ReactionType } from '@linkedout/db';
import type { ReactionResult } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import { AppErrors } from '../../common/errors/app-exception';

function counterData(type: ReactionType, sign: 1 | -1): Prisma.LUpdateInput {
  const inc = { increment: sign };
  switch (type) {
    case 'BEEN_THERE':
      return { reactionCount: inc, beenThereCount: inc };
    case 'HELPFUL':
      return { reactionCount: inc, helpfulCount: inc };
    case 'RESPECT':
      return { reactionCount: inc, respectCount: inc };
    case 'PAIN':
      return { reactionCount: inc, painCount: inc };
    case 'SAVED':
      return { reactionCount: inc, savedCount: inc };
  }
}

@Injectable()
export class ReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent add. Returns true only when a new reaction row was created. */
  async add(userId: string, lId: string, type: ReactionType, authorId: string): Promise<boolean> {
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.reaction.findUnique({
        where: { userId_lId_type: { userId, lId, type } },
        select: { id: true },
      });
      if (existing) return false;
      await tx.reaction.create({ data: { userId, lId, type }, select: { id: true } });
      await tx.l.update({ where: { id: lId }, data: counterData(type, 1), select: { id: true } });
      if (type === 'HELPFUL') {
        await tx.user.update({
          where: { id: authorId },
          data: { buildersHelped: { increment: 1 } },
          select: { id: true },
        });
      }
      return true;
    });
  }

  /** Idempotent remove. Returns true only when an existing row was deleted. */
  async remove(userId: string, lId: string, type: ReactionType, authorId: string): Promise<boolean> {
    return this.prisma.db.$transaction(async (tx) => {
      const existing = await tx.reaction.findUnique({
        where: { userId_lId_type: { userId, lId, type } },
        select: { id: true },
      });
      if (!existing) return false;
      await tx.reaction.delete({ where: { id: existing.id }, select: { id: true } });
      await tx.l.update({ where: { id: lId }, data: counterData(type, -1), select: { id: true } });
      if (type === 'HELPFUL') {
        await tx.user.update({
          where: { id: authorId },
          data: { buildersHelped: { decrement: 1 } },
          select: { id: true },
        });
      }
      return true;
    });
  }

  async resultFor(lId: string, viewerId: string): Promise<ReactionResult> {
    const [l, reactions] = await Promise.all([
      this.prisma.db.l.findUnique({
        where: { id: lId },
        select: {
          reactionCount: true,
          beenThereCount: true,
          helpfulCount: true,
          respectCount: true,
          painCount: true,
          savedCount: true,
        },
      }),
      this.prisma.db.reaction.findMany({
        where: { userId: viewerId, lId },
        select: { type: true },
      }),
    ]);
    if (!l) throw AppErrors.lNotFound();
    return {
      reactions: {
        total: l.reactionCount,
        beenThere: l.beenThereCount,
        helpful: l.helpfulCount,
        respect: l.respectCount,
        pain: l.painCount,
        saved: l.savedCount,
      },
      viewer: { reactions: reactions.map((r) => r.type) },
    };
  }
}
