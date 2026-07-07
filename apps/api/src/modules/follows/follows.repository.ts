import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import {
  USER_SUMMARY_SELECT,
  type UserSummarySource,
} from '../../common/mappers/user-summary.mapper';
import { encodeCursor } from '../../common/pagination/cursor';
import { buildPage, type EntityPage } from '../../common/pagination/paginate';

@Injectable()
export class FollowsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Idempotent follow. Returns true only when a new edge was created. */
  async follow(followerId: string, followingId: string): Promise<boolean> {
    const existing = await this.prisma.db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
    if (existing) return false;
    await this.prisma.db.follow.create({ data: { followerId, followingId }, select: { id: true } });
    return true;
  }

  async unfollow(followerId: string, followingId: string): Promise<boolean> {
    const result = await this.prisma.db.follow.deleteMany({
      where: { followerId, followingId },
    });
    return result.count > 0;
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
