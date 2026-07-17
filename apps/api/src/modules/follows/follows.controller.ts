import { Controller, Delete, Get, Param, Put, Query, UseGuards, Version } from '@nestjs/common';
import {
  paginationQuerySchema,
  type FollowResult,
  type Paginated,
  type PaginationQuery,
  type UserSummary,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { FollowsService } from './follows.service';

const listPipe = new ZodValidationPipe(paginationQuerySchema());

@Controller({ path: 'users', version: ['1', '2'] })
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Put(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollow)
  follow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ): Promise<FollowResult> {
    return this.follows.follow(user, username);
  }

  @Delete(':username/follow')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userUnfollow)
  unfollow(
    @CurrentUser() user: AuthUser,
    @Param('username') username: string,
  ): Promise<FollowResult> {
    return this.follows.unfollow(user, username);
  }

  @Get(':username/followers')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollowers)
  followersV1(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowers(username, query);
  }

  @Get(':username/followers')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userFollowers)
  followersV2(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowers(username, query);
  }

  @Get(':username/following')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userFollowing)
  followingV1(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowing(username, query);
  }

  @Get(':username/following')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userFollowing)
  followingV2(
    @Param('username') username: string,
    @Query(listPipe) query: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.follows.listFollowing(username, query);
  }
}
