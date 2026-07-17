import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  journeyQuerySchema,
  usernameInputSchema,
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

const userLsPipe = new ZodValidationPipe(userLsQuerySchema);
const journeyPipe = new ZodValidationPipe(journeyQuerySchema);
const usernamePipe = new ZodValidationPipe(usernameInputSchema);

@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  constructor(private readonly ls: LsService) {}

  @Get(':username/ls')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userLs)
  async userLs(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
    @Query(userLsPipe) query: UserLsQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getUserLsByUsernameV2(username, query, user?.id);
  }

  @Get(':username/journey')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.userJourney)
  async journey(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
    @Query(journeyPipe) query: JourneyQuery,
  ): Promise<Paginated<JourneyNode>> {
    return this.ls.getJourneyByUsernameV2(username, query, user?.id);
  }
}
