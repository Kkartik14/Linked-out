import { Injectable } from '@nestjs/common';
import type { FollowResult, Paginated, PaginationQuery, UserSummary } from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import { decodeCursorId } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import { UsersService } from '../users/users.service';
import { FollowsRepository } from './follows.repository';

@Injectable()
export class FollowsService {
  constructor(
    private readonly repo: FollowsRepository,
    private readonly users: UsersService,
  ) {}

  async follow(user: AuthUser, username: string): Promise<FollowResult> {
    const targetId = await this.users.requireUserId(username);
    if (targetId === user.id) {
      throw AppErrors.validationMessage('You cannot follow yourself.');
    }
    await this.repo.follow(user.id, targetId, {
      type: 'NEW_FOLLOWER',
      recipientId: targetId,
      actorId: user.id,
      lId: null,
      dedupeKey: `follow:${targetId}:${user.id}`,
    });
    return { isFollowing: true, counts: await this.users.getFollowCounts(targetId) };
  }

  async unfollow(user: AuthUser, username: string): Promise<FollowResult> {
    const targetId = await this.users.requireUserId(username);
    await this.repo.unfollow(user.id, targetId);
    return { isFollowing: false, counts: await this.users.getFollowCounts(targetId) };
  }

  async listFollowers(username: string, query: PaginationQuery): Promise<Paginated<UserSummary>> {
    const targetId = await this.users.requireUserId(username);
    const page = await this.repo.listFollowers(targetId, query.limit, decodeCursorId(query.cursor));
    return mapPage(page, toUserSummary);
  }

  async listFollowing(username: string, query: PaginationQuery): Promise<Paginated<UserSummary>> {
    const targetId = await this.users.requireUserId(username);
    const page = await this.repo.listFollowing(targetId, query.limit, decodeCursorId(query.cursor));
    return mapPage(page, toUserSummary);
  }
}
