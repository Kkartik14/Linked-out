import { Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { AuthMeResponse } from '@linkedout/contracts';
import type { Request, Response } from 'express';

import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { AppErrors } from '../../common/errors/app-exception';
import { getCookie } from '../../common/http/cookies';
import type { AuthUser } from '../../common/types/auth';
import { AppConfigService } from '../../config/app-config.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GithubAuthGuard, GoogleAuthGuard } from './oauth.guards';
import { REFRESH_COOKIE, TokenService } from './token.service';
import { decodeReturnTo } from './oauth-state';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleStart(): void {
    // The guard redirects to Google; this body never runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(
    @OptionalUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.completeOAuth(user, req, res);
  }

  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubStart(): void {
    // The guard redirects to GitHub; this body never runs.
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  githubCallback(
    @OptionalUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    this.completeOAuth(user, req, res);
  }

  @Get('me')
  @UseGuards(OptionalAuthGuard)
  async me(@OptionalUser() user: AuthUser | undefined): Promise<AuthMeResponse> {
    if (!user) {
      return { user: null, needsOnboarding: false };
    }
    const profile = await this.users.getSelfProfile(user.id);
    return { user: profile, needsOnboarding: user.username === null };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = getCookie(req, REFRESH_COOKIE);
    if (!token) throw AppErrors.unauthenticated();
    const user = await this.auth.userFromRefresh(token);
    this.tokens.setAccessCookie(res, user);
    return { ok: true };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Res({ passthrough: true }) res: Response): { ok: true } {
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  private completeOAuth(user: AuthUser | undefined, req: Request, res: Response): void {
    if (!user) {
      const error = req.query.error === 'access_denied' ? 'access_denied' : 'oauth_failed';
      res.redirect(`${this.config.webUrl}/auth/callback?error=${error}`);
      return;
    }
    const returnTo = decodeReturnTo(req.query.state);
    this.tokens.setAuthCookies(res, user);
    res.redirect(`${this.config.webUrl}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);
  }
}
