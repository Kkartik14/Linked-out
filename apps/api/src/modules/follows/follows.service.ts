import { Injectable } from '@nestjs/common';
import type {
  FollowListUser,
  FollowResult,
  Paginated,
  PaginationQuery,
} from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import type { UserSummarySource } from '../../common/mappers/user-summary.mapper';
import { decodeCursorId } from '../../common/pagination/cursor';
import { mapPage, type EntityPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import { UsersService } from '../users/users.service';
import { toFollowListUser } from './follows.mapper';
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

  async listFollowers(
    username: string,
    viewer: AuthUser | undefined,
    query: PaginationQuery,
  ): Promise<Paginated<FollowListUser>> {
    const targetId = await this.users.requireUserId(username);
    const page = await this.repo.listFollowers(targetId, query.limit, decodeCursorId(query.cursor));
    return this.withViewerState(page, viewer);
  }

  async listFollowing(
    username: string,
    viewer: AuthUser | undefined,
    query: PaginationQuery,
  ): Promise<Paginated<FollowListUser>> {
    const targetId = await this.users.requireUserId(username);
    const page = await this.repo.listFollowing(targetId, query.limit, decodeCursorId(query.cursor));
    return this.withViewerState(page, viewer);
  }

  /**
   * Attaches the viewer's follow relationship to each row. A signed-in viewer's follow edges over
   * the page are resolved in a single batch query; a signed-out viewer follows no one and is no one.
   */
  private async withViewerState(
    page: EntityPage<UserSummarySource>,
    viewer: AuthUser | undefined,
  ): Promise<Paginated<FollowListUser>> {
    const followed = viewer
      ? await this.repo.followedIdsAmong(
          viewer.id,
          page.rows.map((row) => row.id),
        )
      : null;
    return mapPage(page, (row) =>
      toFollowListUser(row, {
        isFollowing: followed?.has(row.id) ?? false,
        isSelf: viewer?.id === row.id,
      }),
    );
  }
}
