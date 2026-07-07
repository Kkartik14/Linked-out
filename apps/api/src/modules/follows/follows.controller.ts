import { Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  type FollowResult,
  type Paginated,
  type PaginationQuery,
  type UserSummary,
} from '@linkedout/contracts';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { FollowsService } from './follows.service';

const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put(':username/follow')
  @UseGuards(JwtAuthGuard)
  follow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ): Promise<FollowResult> {
    return this.follows.follow(user, username);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ): Promise<FollowResult> {
    return this.follows.unfollow(user, username);
  }

  @Get(':username/followers')
  @UseGuards(OptionalAuthGuard)
  followers(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowers(username, query);
  }

  @Get(':username/following')
  @UseGuards(OptionalAuthGuard)
  following(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowing(username, query);
  }
}
