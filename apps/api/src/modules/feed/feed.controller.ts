import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { feedQuerySchema, type FeedQuery, type LCard, type Paginated } from '@linkedout/contracts';

import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';

const feedQueryPipe = new ZodValidationPipe(feedQuerySchema);

@Controller('feed')
export class FeedController {
  constructor(private readonly ls: LsService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  global(
    @OptionalUser() user: AuthUser | undefined,
    @Query(feedQueryPipe) query: FeedQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getFeed(query, user?.id);
  }

  @Get('following')
  @UseGuards(JwtAuthGuard)
  following(
    @CurrentUser() user: AuthUser,
    @Query(feedQueryPipe) query: FeedQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getFollowingFeed(user.id, query);
  }
}
