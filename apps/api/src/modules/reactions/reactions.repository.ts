import { Injectable } from '@nestjs/common';
import { Prisma, type NotificationType, type ReactionType } from '@linkedout/db';
import type { ReactionResult } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import { AppErrors } from '../../common/errors/app-exception';

const TRENDING_WEIGHT: Readonly<Record<ReactionType, number>> = {
  BEEN_THERE: 2,
  HELPFUL: 3,
  RESPECT: 2,
  PAIN: 1,
  SAVED: 0,
};

function counterData(type: ReactionType, sign: 1 | -1): Prisma.LUpdateInput {
  const inc = { increment: sign };
  const trendingScore = { increment: sign * TRENDING_WEIGHT[type] };
  switch (type) {
    case 'BEEN_THERE':
      return { reactionCount: inc, beenThereCount: inc, trendingScore };
    case 'HELPFUL':
      return { reactionCount: inc, helpfulCount: inc, trendingScore };
    case 'RESPECT':
      return { reactionCount: inc, respectCount: inc, trendingScore };
    case 'PAIN':
      return { reactionCount: inc, painCount: inc, trendingScore };
    case 'SAVED':
      return { reactionCount: inc, savedCount: inc, trendingScore };
  }
}

function isWriteConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034';
}

export interface FoldedNotificationWrite {
  type: NotificationType;
  recipientId: string;
  actorId: string;
  lId: string;
  dedupeKey: string;
}

export interface FoldedNotificationClear {
  dedupeKey: string;
  recipientId: string;
  lId: string;
  reactionType: ReactionType;
}

@Injectable()
export class ReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent add. Returns true only when a new reaction row was created. */
  async add(
    userId: string,
    lId: string,
    type: ReactionType,
    authorId: string,
    notification: FoldedNotificationWrite | null,
  ): Promise<boolean> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(
          async (tx) => {
            const created = await tx.reaction.createMany({
              data: [{ userId, lId, type }],
              skipDuplicates: true,
            });
            if (created.count === 0) return false;
            await tx.l.update({
              where: { id: lId },
              data: counterData(type, 1),
              select: { id: true },
            });
            if (type === 'HELPFUL' && authorId !== userId) {
              await tx.user.update({
                where: { id: authorId },
                data: { buildersHelped: { increment: 1 } },
                select: { id: true },
              });
            }
            if (notification) {
              await tx.notification.upsert({
                where: { dedupeKey: notification.dedupeKey },
                create: notification,
                update: { actorId: notification.actorId, readAt: null, createdAt: new Date() },
                select: { id: true },
              });
            }
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
  }

  /** Idempotent remove. Returns true only when an existing row was deleted. */
  async remove(
    userId: string,
    lId: string,
    type: ReactionType,
    authorId: string,
    clearNotification: FoldedNotificationClear | null,
  ): Promise<boolean> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(
          async (tx) => {
            const removed = await tx.reaction.deleteMany({
              where: { userId, lId, type },
            });
            if (removed.count === 0) return false;
            await tx.l.update({
              where: { id: lId },
              data: counterData(type, -1),
              select: { id: true },
            });
            if (type === 'HELPFUL' && authorId !== userId) {
              await tx.user.update({
                where: { id: authorId },
                data: { buildersHelped: { decrement: 1 } },
                select: { id: true },
              });
            }
            if (clearNotification) {
              await tx.$executeRaw`
                DELETE FROM "Notification"
                WHERE "dedupeKey" = ${clearNotification.dedupeKey}
                  AND NOT EXISTS (
                    SELECT 1 FROM "Reaction"
                    WHERE "lId" = ${clearNotification.lId}
                      AND "type" = ${clearNotification.reactionType}::"ReactionType"
                      AND "userId" <> ${clearNotification.recipientId}
                  )
              `;
            }
            return true;
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        attempt += 1;
        if (!isWriteConflict(error) || attempt >= 3) throw error;
      }
    }
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
