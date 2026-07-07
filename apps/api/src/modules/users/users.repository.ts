import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
  bio: true,
  status: true,
  storiesShared: true,
  lessonsShared: true,
  buildersHelped: true,
  lsShared: true,
  collectionsCreated: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

export interface FollowCounts {
  followers: number;
  following: number;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<UserProfileRow | null> {
    return this.prisma.db.user.findUnique({ where: { username }, select: PROFILE_SELECT });
  }

  findById(id: string): Promise<UserProfileRow | null> {
    return this.prisma.db.user.findUnique({ where: { id }, select: PROFILE_SELECT });
  }

  idByUsername(username: string): Promise<{ id: string } | null> {
    return this.prisma.db.user.findUnique({ where: { username }, select: { id: true } });
  }

  async usernameTaken(username: string, exceptUserId: string): Promise<boolean> {
    const existing = await this.prisma.db.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return existing !== null && existing.id !== exceptUserId;
  }

  update(id: string, data: Prisma.UserUpdateInput): Promise<UserProfileRow> {
    return this.prisma.db.user.update({ where: { id }, data, select: PROFILE_SELECT });
  }

  async counts(userId: string): Promise<FollowCounts> {
    const [followers, following] = await Promise.all([
      this.prisma.db.follow.count({ where: { followingId: userId } }),
      this.prisma.db.follow.count({ where: { followerId: userId } }),
    ]);
    return { followers, following };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.prisma.db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
    return follow !== null;
  }
}
