import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';
import type { ReactionType } from '@linkedout/contracts';

import { PrismaService } from '../../prisma/prisma.service';
import type {
  ReactionAddPlan,
  ReactionCounterDelta,
  ReactionRemovePlan,
} from './reactions.plan';

/** P2034 = deadlock/write conflict, P2002 = unique violation lost to a concurrent insert. */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}

export interface ReactionState {
  counters: {
    total: number;
    beenThere: number;
    helpful: number;
    respect: number;
    pain: number;
    saved: number;
  };
  viewerReactions: ReactionType[];
}

@Injectable()
export class ReactionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent add. Returns true only when a new reaction row was created.
   *
   * Runs at the default READ COMMITTED isolation on purpose. Every step is already
   * atomic on its own — `skipDuplicates` compiles to `ON CONFLICT DO NOTHING` behind the
   * `(userId, lId, type)` unique index, `increment` compiles to `x = x + 1` under a row
   * lock, and the upsert is guarded by the unique `dedupeKey`. SERIALIZABLE would add no
   * correctness here but would abort concurrent reactors contending on the same hot L row
   * and folded-notification row, surfacing as 500s on a popular L.
   */
  async add(plan: ReactionAddPlan): Promise<boolean> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(async (tx) => {
          const created = await tx.reaction.createMany({
            data: [plan.reaction],
            skipDuplicates: true,
          });
          if (created.count === 0) return false;
          await tx.l.update({
            where: { id: plan.reaction.lId },
            data: incrementCounters(plan.lCounters),
            select: { id: true },
          });
          if (plan.reputation) {
            await tx.user.update({
              where: { id: plan.reputation.userId },
              data: { buildersHelped: { increment: plan.reputation.buildersHelped } },
              select: { id: true },
            });
          }
          if (plan.notification) {
            const record = plan.notification.record;
            await tx.notification.upsert({
              where: { dedupeKey: record.dedupeKey },
              create: record,
              update: { actorId: record.actorId, readAt: null, createdAt: new Date() },
              select: { id: true },
            });
          }
          return true;
        });
      } catch (error) {
        attempt += 1;
        if (!isRetryable(error) || attempt >= 3) throw error;
      }
    }
  }

  /**
   * Idempotent remove. Returns true only when an existing row was deleted.
   *
   * READ COMMITTED for the same reason as `add`: `deleteMany` reports the rows it really
   * removed, so exactly one concurrent caller decrements, and the notification cleanup
   * re-checks `Reaction` in the same statement.
   */
  async remove(plan: ReactionRemovePlan): Promise<boolean> {
    let attempt = 0;
    while (true) {
      try {
        return await this.prisma.db.$transaction(
          async (tx) => {
            const removed = await tx.reaction.deleteMany({
              where: plan.reaction,
            });
            if (removed.count === 0) return false;
            await tx.l.update({
              where: { id: plan.reaction.lId },
              data: incrementCounters(plan.lCounters),
              select: { id: true },
            });
            if (plan.reputation) {
              await tx.user.update({
                where: { id: plan.reputation.userId },
                data: { buildersHelped: { increment: plan.reputation.buildersHelped } },
                select: { id: true },
              });
            }
            if (plan.notification) {
              await tx.$executeRaw`
                DELETE FROM "Notification"
                WHERE "dedupeKey" = ${plan.notification.dedupeKey}
                  AND NOT EXISTS (
                    SELECT 1 FROM "Reaction"
                    WHERE "lId" = ${plan.notification.lId}
                      AND "type" = ${plan.notification.reactionType}::"ReactionType"
                      AND "userId" <> ${plan.notification.recipientId}
                  )
              `;
            }
            return true;
          },
        );
      } catch (error) {
        attempt += 1;
        if (!isRetryable(error) || attempt >= 3) throw error;
      }
    }
  }

  async findState(lId: string, viewerId: string): Promise<ReactionState | null> {
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
    if (!l) return null;
    return {
      counters: {
        total: l.reactionCount,
        beenThere: l.beenThereCount,
        helpful: l.helpfulCount,
        respect: l.respectCount,
        pain: l.painCount,
        saved: l.savedCount,
      },
      viewerReactions: reactions.map((r) => r.type),
    };
  }
}

/** Mechanical domain-delta to Prisma-operator translation; all values are plan-owned. */
function incrementCounters(delta: ReactionCounterDelta): Prisma.LUpdateInput {
  const data: Prisma.LUpdateInput = {};
  if (delta.reactionCount !== undefined) {
    data.reactionCount = { increment: delta.reactionCount };
  }
  if (delta.beenThereCount !== undefined) {
    data.beenThereCount = { increment: delta.beenThereCount };
  }
  if (delta.helpfulCount !== undefined) data.helpfulCount = { increment: delta.helpfulCount };
  if (delta.respectCount !== undefined) data.respectCount = { increment: delta.respectCount };
  if (delta.painCount !== undefined) data.painCount = { increment: delta.painCount };
  if (delta.savedCount !== undefined) data.savedCount = { increment: delta.savedCount };
  if (delta.popularityScore !== undefined) {
    data.popularityScore = { increment: delta.popularityScore };
  }
  return data;
}
