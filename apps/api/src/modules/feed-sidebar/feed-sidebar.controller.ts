import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  feedSidebarQuerySchema,
  type FeedSidebarQuery,
  type FeedSidebarResponse,
} from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { FeedSidebarService } from './feed-sidebar.service';

const queryPipe = new ZodValidationPipe(feedSidebarQuerySchema);
const PRIVATE_NO_STORE = 'private, no-store, max-age=0';

@Controller({ path: 'feed', version: '2' })
export class FeedSidebarController {
  constructor(private readonly sidebar: FeedSidebarService) {}

  @Get('sidebar')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.feedSidebar)
  get(
    @OptionalUser() user: AuthUser | undefined,
    @Query(queryPipe) _query: FeedSidebarQuery,
  ): Promise<FeedSidebarResponse> {
    return this.sidebar.load(user);
  }
}
