import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import {
  feedSidebarQuerySchema,
  type FeedSidebarQuery,
  type FeedSidebarResponse,
} from '@linkedout/contracts';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { FeedSidebarService } from './feed-sidebar.service';

const queryPipe = new ZodValidationPipe(feedSidebarQuerySchema);
const PRIVATE_NO_STORE = 'private, no-store, max-age=0';

@Controller('feed')
export class FeedSidebarController {
  constructor(private readonly sidebar: FeedSidebarService) {}

  @Get('sidebar')
  @Header('Cache-Control', PRIVATE_NO_STORE)
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.feedSidebar)
  get(
    @OptionalUser() user: AuthUser | undefined,
    @Query(queryPipe) _query: FeedSidebarQuery,
  ): Promise<FeedSidebarResponse> {
    return this.sidebar.load(user);
  }
}
