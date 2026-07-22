import { Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import {
  paginationQuerySchema,
  usernameInputSchema,
  type FollowListUser,
  type FollowResult,
  type Paginated,
  type PaginationQuery,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { FollowsService } from './follows.service';

const listPipe = new ZodValidationPipe(paginationQuerySchema());
const usernamePipe = new ZodValidationPipe(usernameInputSchema);

@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollow)
  follow(
    @CurrentUser() user: AuthUser,
    @Param('username', usernamePipe) username: string,
  ): Promise<FollowResult> {
    return this.follows.follow(user, username);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userUnfollow)
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('username', usernamePipe) username: string,
  ): Promise<FollowResult> {
    return this.follows.unfollow(user, username);
  }

  @Get(':username/followers')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollowers)
  followers(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<FollowListUser>> {
    return this.follows.listFollowers(username, user, query);
  }

  @Get(':username/following')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollowing)
  following(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<FollowListUser>> {
    return this.follows.listFollowing(username, user, query);
  }
}
