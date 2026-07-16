import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  journeyQuerySchema,
  userLsQuerySchema,
  type JourneyNode,
  type JourneyQuery,
  type LCard,
  type Paginated,
  type UserLsQuery,
} from '@linkedout/contracts/v2';

import { ApiContract } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { UsersService } from './users.service';

const userLsPipe = new ZodValidationPipe(userLsQuerySchema);
const journeyPipe = new ZodValidationPipe(journeyQuerySchema);

@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  constructor(
    private readonly users: UsersService,
    private readonly ls: LsService,
  ) {}

  @Get(':username/ls')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userLs)
  async userLs(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(userLsPipe) query: UserLsQuery,
  ): Promise<Paginated<LCard>> {
    const authorId = await this.users.requireUserId(username);
    return this.ls.getUserLsV2(authorId, query, user?.id);
  }

  @Get(':username/journey')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userJourney)
  async journey(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(journeyPipe) query: JourneyQuery,
  ): Promise<Paginated<JourneyNode>> {
    const authorId = await this.users.requireUserId(username);
    return this.ls.getJourneyV2(authorId, query, user?.id);
  }
}
