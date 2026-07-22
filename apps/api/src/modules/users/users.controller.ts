import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import {
  usernameInputSchema,
  userLsQuerySchema,
  type LCard,
  type Paginated,
  type UpdateUserInput,
  type UserLsQuery,
  type UserProfile,
} from '@linkedout/contracts';
import type { Response } from 'express';

import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { CurrentUser, OptionalUser } from '../../common/decorators/current-user.decorator';
import { AppErrors } from '../../common/errors/app-exception';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { TokenService } from '../auth/token.service';
import { LsService } from '../ls/ls.service';
import { UsersService } from './users.service';

const updatePipe = new ZodValidationPipe(API_ROUTE_CONTRACTS.userUpdateMe.body.schema, {
  mapError: (error) =>
    error.issues.some((issue) => issue.path[0] === 'username')
      ? AppErrors.usernameInvalid()
      : null,
});
const userLsPipe = new ZodValidationPipe(userLsQuerySchema);
const usernamePipe = new ZodValidationPipe(usernameInputSchema);

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly ls: LsService,
    private readonly tokens: TokenService,
  ) {}

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userUpdateMe)
  async updateMe(
    @CurrentUser() user: AuthUser,
    @Body(updatePipe) body: UpdateUserInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<UserProfile> {
    const profile = await this.users.updateMe(user, body);
    // The JWT username is used only as the onboarding-complete bit. Refresh that claim
    // exactly once, from the persisted result, so the newly-onboarded user can write
    // immediately. Ordinary profile/username edits must not renew an access-only principal.
    if (user.username === null && profile.username.length > 0) {
      this.tokens.setAccessCookie(response, { id: user.id, username: profile.username });
    }
    return profile;
  }

  @Get(':username')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userProfile)
  profile(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
  ): Promise<UserProfile> {
    return this.users.getProfileByUsername(username, user?.id);
  }

  @Get(':username/ls')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.userLs)
  async userLs(
    @OptionalUser() user: AuthUser | undefined,
    @Param('username', usernamePipe) username: string,
    @Query(userLsPipe) query: UserLsQuery,
  ): Promise<Paginated<LCard>> {
    return this.ls.getUserLsByUsername(username, query, user?.id);
  }
}
