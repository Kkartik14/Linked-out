import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  USER_SUMMARY_SELECT,
  type UserSummarySource,
} from '../../common/mappers/user-summary.mapper';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

export interface FollowNotificationWrite {
  type: 'NEW_FOLLOWER';
  recipientId: string;
  actorId: string;
  lId: null;
  dedupeKey: string;
}

@Injectable()
export class FollowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent follow. Returns true only when a new edge was created. */
  async follow(
    followerId: string,
    followingId: string,
    notification: FollowNotificationWrite,
  ): Promise<boolean> {
    const created = await this.prisma.db.$transaction(async (tx) => {
      // PostgreSQL Follow triggers maintain both endpoint counters for each row
      // that actually survives skipDuplicates, inside this same transaction.
      const result = await tx.follow.createMany({
        data: [{ followerId, followingId }],
        skipDuplicates: true,
      });
      if (result.count === 0) return false;
      await tx.notification.createMany({ data: [notification], skipDuplicates: true });
      return true;
    });
    return created;
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    // The delete trigger decrements both counters only when a row was deleted.
    const result = await this.prisma.db.follow.deleteMany({
      where: { followerId, followingId },
    });
    return result.count > 0;
  }

  /** Of the given candidate ids, which does `followerId` already follow? One batched query. */
  async followedIdsAmong(followerId: string, candidateIds: string[]): Promise<Set<string>> {
    if (candidateIds.length === 0) return new Set();
    const edges = await this.prisma.db.follow.findMany({
      where: { followerId, followingId: { in: candidateIds } },
      select: { followingId: true },
    });
    return new Set(edges.map((edge) => edge.followingId));
  }

  async listFollowers(
    userId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<UserSummarySource>> {
    const rows = await this.prisma.db.follow.findMany({
      where: { followingId: userId, ...(cursorId ? { id: { lt: cursorId } } : {}) },
      select: { id: true, follower: { select: USER_SUMMARY_SELECT } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
    return { rows: page.rows.map((row) => row.follower), nextCursor: page.nextCursor };
  }

  async listFollowing(
    userId: string,
    limit: number,
    cursorId: string | undefined,
  ): Promise<EntityPage<UserSummarySource>> {
    const rows = await this.prisma.db.follow.findMany({
      where: { followerId: userId, ...(cursorId ? { id: { lt: cursorId } } : {}) },
      select: { id: true, following: { select: USER_SUMMARY_SELECT } },
      orderBy: { id: 'desc' },
      take: limit + 1,
    });
    const page = buildPage(rows, limit, (row) => encodeCursor({ id: row.id }));
    return { rows: page.rows.map((row) => row.following), nextCursor: page.nextCursor };
  }
}
