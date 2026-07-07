import { Injectable } from '@nestjs/common';
import type { UpdateUserInput, UserProfile } from '@linkedout/contracts';
import { Prisma } from '@linkedout/db';

import { AppErrors } from '../../common/errors/app-exception';
import type { AuthUser } from '../../common/types/auth';
import { UsersRepository, type UserProfileRow } from './users.repository';
import { toUserProfile } from './users.mapper';

function buildUpdate(input: UpdateUserInput): Prisma.UserUpdateInput {
  return {
    username: input.username,
    name: input.name,
    bio: input.bio,
    image: input.image,
    status: input.status,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly repo: UsersRepository) {}

  async getProfileByUsername(
    username: string,
    viewerId: string | undefined,
  ): Promise<UserProfile> {
    const user = await this.repo.findByUsername(username);
    if (!user) throw AppErrors.userNotFound();
    return this.composeProfile(user, viewerId);
  }

  async getSelfProfile(userId: string): Promise<UserProfile> {
    const user = await this.repo.findById(userId);
    if (!user) throw AppErrors.userNotFound();
    const counts = await this.repo.counts(user.id);
    return toUserProfile(user, counts, { isSelf: true, isFollowing: false });
  }

  async updateMe(user: AuthUser, input: UpdateUserInput): Promise<UserProfile> {
    if (input.username !== undefined) {
      if (await this.repo.usernameTaken(input.username, user.id)) {
        throw AppErrors.usernameTaken();
      }
    }
    let updated;
    try {
      updated = await this.repo.update(user.id, buildUpdate(input));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw AppErrors.usernameTaken();
      }
      throw error;
    }
    const counts = await this.repo.counts(updated.id);
    return toUserProfile(updated, counts, { isSelf: true, isFollowing: false });
  }

  /** Resolve a username to its id, or 404. Used by user-scoped list routes. */
  async requireUserId(username: string): Promise<string> {
    const found = await this.repo.idByUsername(username);
    if (!found) throw AppErrors.userNotFound();
    return found.id;
  }

  private async composeProfile(
    user: UserProfileRow,
    viewerId: string | undefined,
  ): Promise<UserProfile> {
    const counts = await this.repo.counts(user.id);
    const isSelf = viewerId === user.id;
    const isFollowing =
      viewerId !== undefined && !isSelf ? await this.repo.isFollowing(viewerId, user.id) : false;
    return toUserProfile(user, counts, { isSelf, isFollowing });
  }
}
