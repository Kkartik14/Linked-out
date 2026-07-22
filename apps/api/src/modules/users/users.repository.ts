import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import { lockAvatarObjectKey } from '../../common/avatar/avatar-object';
import { AvatarObjectUnavailableError, UsernameConflictError } from './users.errors';
import type { FollowCounts, UpdateUserData } from './users.types';

const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
  bio: true,
  status: true,
  storiesShared: true,
  lessonsShared: true,
  lsShared: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

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

  async update(id: string, data: UpdateUserData): Promise<UserProfileRow> {
    const { avatar, ...profile } = data;
    const updateData: Prisma.UserUpdateInput = {
      ...profile,
      ...(avatar === undefined
        ? {}
        : avatar === null
          ? { image: null, avatarObjectKey: null }
          : { image: avatar.publicUrl, avatarObjectKey: avatar.objectKey }),
    };
    try {
      if (avatar === undefined || avatar === null) {
        return await this.prisma.db.user.update({ where: { id }, data: updateData, select: PROFILE_SELECT });
      }

      return await this.prisma.db.$transaction(async (tx) => {
        await lockAvatarObjectKey(tx, avatar.objectKey);
        const deletionClaim = await tx.avatarDeletionClaim.findUnique({
          where: { key: avatar.objectKey },
          select: { key: true },
        });
        if (deletionClaim) throw new AvatarObjectUnavailableError();
        return tx.user.update({ where: { id }, data: updateData, select: PROFILE_SELECT });
      });
    } catch (error) {
      if (error instanceof AvatarObjectUnavailableError) throw error;
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new UsernameConflictError();
      }
      throw error;
    }
  }

  async counts(userId: string): Promise<FollowCounts> {
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { followerCount: true, followingCount: true },
    });
    return { followers: user.followerCount, following: user.followingCount };
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    const follow = await this.prisma.db.follow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
      select: { id: true },
    });
    return follow !== null;
  }
}
