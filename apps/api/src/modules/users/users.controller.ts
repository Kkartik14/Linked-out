import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import {
  journeyQuerySchema,
  updateUserInputSchema,
  userLsQuerySchema,
  type JourneyNode,
  type JourneyQuery,
  type LCard,
  type Paginated,
  type UpdateUserInput,
  type UserLsQuery,
  type UserProfile,
} from '@linkedout/contracts';

import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { AppErrors } from '../../common/errors/app-exception';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { UsersService } from './users.service';

const updatePipe = new ZodValidationPipe(updateUserInputSchema, {
  mapError: (error) =>
    error.issues.some((issue) => issue.path[0] === 'username')
      ? AppErrors.usernameInvalid()
      : null,
});
const userLsPipe = new ZodValidationPipe(userLsQuerySchema);
const journeyPipe = new ZodValidationPipe(journeyQuerySchema);

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly ls: LsService,
  ) {}

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateMe(
    @CurrentUser() user: AuthUser,
    @Body(updatePipe) body: UpdateUserInput,
  ): Promise<UserProfile> {
    return this.users.updateMe(user, body);
  }

  @Get(':username')
  @UseGuards(OptionalAuthGuard)
  profile(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
  ): Promise<UserProfile> {
    return this.users.getProfileByUsername(username, user?.id);
  }

  @Get(':username/ls')
  @UseGuards(OptionalAuthGuard)
  async userLs(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(userLsPipe) query: UserLsQuery,
  ): Promise<Paginated<LCard>> {
    const authorId = await this.users.requireUserId(username);
    return this.ls.getUserLs(authorId, query, user?.id);
  }

  @Get(':username/journey')
  @UseGuards(OptionalAuthGuard)
  async journey(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username') username: string,
    @Query(journeyPipe) query: JourneyQuery,
  ): Promise<Paginated<JourneyNode>> {
    const authorId = await this.users.requireUserId(username);
    return this.ls.getJourney(authorId, query, user?.id);
  }
}
