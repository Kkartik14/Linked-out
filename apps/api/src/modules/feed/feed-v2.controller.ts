import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { feedQuerySchema, type FeedQuery, type LCard, type Paginated } from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';

const feedQueryPipe = new ZodValidationPipe(feedQuerySchema);

@Controller({ path: 'feed', version: '2' })
export class FeedV2Controller {
  constructor(private readonly ls: LsService) {}

  @Get()
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.feedGlobal)
  global(
    @OptionalUser() user: AuthUser | undefined,
    @Query(feedQueryPipe) query: FeedQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getFeedV2(query, user?.id);
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.feedFollowing)
  following(
    @CurrentUser() user: AuthUser,
    @Query(feedQueryPipe) query: FeedQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getFollowingFeedV2(user.id, query);
  }
}
