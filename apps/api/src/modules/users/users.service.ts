import { Injectable } from '@nestjs/common';
import { usernameInputSchema, type UpdateUserInput, type UserProfile } from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { ownedAvatarObjectKey } from '../../common/avatar/avatar-object';
import type { AuthUser } from '../../common/types/auth';
import { AppConfigService } from '../../config/app-config.service';
import {
  UsersRepository,
  type UserProfileRow,
} from './users.repository';
import { AvatarObjectUnavailableError, UsernameConflictError } from './users.errors';
import type { FollowCounts, UpdateUserData } from './users.types';
import { toUserProfile } from './users.mapper';

function buildUpdate(input: UpdateUserInput, avatarObjectKey: string | null | undefined): UpdateUserData {
  return {
    username: input.username,
    name: input.name,
    bio: input.bio,
    status: input.status,
    avatar:
      input.image === undefined
        ? undefined
        : input.image === null
          ? null
          : { publicUrl: input.image, objectKey: avatarObjectKey! },
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly config: AppConfigService,
  ) {}

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
    return toUserProfile(user, { isSelf: true, isFollowing: false });
  }

  async updateMe(user: AuthUser, input: UpdateUserInput): Promise<UserProfile> {
    let avatarObjectKey: string | null | undefined;
    if (input.image !== undefined && input.image !== null) {
      avatarObjectKey = this.requireOwnedAvatarObjectKey(user.id, input.image);
    } else {
      avatarObjectKey = input.image;
    }
    if (input.username !== undefined) {
      if (!usernameInputSchema.safeParse(input.username).success) {
        throw AppErrors.usernameInvalid();
      }
    }
    let updated;
    try {
      updated = await this.repo.update(user.id, buildUpdate(input, avatarObjectKey));
    } catch (error) {
      if (error instanceof UsernameConflictError) {
        throw AppErrors.usernameTaken();
      }
      if (error instanceof AvatarObjectUnavailableError) {
        throw AppErrors.validationMessage(
          'This avatar upload is no longer available. Upload the image again.',
        );
      }
      throw error;
    }
    return toUserProfile(updated, { isSelf: true, isFollowing: false });
  }

  /** Resolve a username to its id, or 404. Used by user-scoped list routes. */
  async requireUserId(username: string): Promise<string> {
    const found = await this.repo.idByUsername(username);
    if (!found) throw AppErrors.userNotFound();
    return found.id;
  }

  /** Public service seam for follow mutations; keeps the users DAL private to its module. */
  getFollowCounts(userId: string): Promise<FollowCounts> {
    return this.repo.counts(userId);
  }

  private async composeProfile(
    user: UserProfileRow,
    viewerId: string | undefined,
  ): Promise<UserProfile> {
    const isSelf = viewerId === user.id;
    const isFollowing =
      viewerId !== undefined && !isSelf ? await this.repo.isFollowing(viewerId, user.id) : false;
    return toUserProfile(user, { isSelf, isFollowing });
  }

  private requireOwnedAvatarObjectKey(userId: string, imageUrl: string): string {
    const key = ownedAvatarObjectKey(this.config.r2.publicBaseUrl, userId, imageUrl);
    if (!key) {
      throw AppErrors.validationMessage('Avatar image must come from your uploaded avatar URL.');
    }
    return key;
  }
}
