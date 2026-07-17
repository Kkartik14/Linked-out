import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  oauthHandoffExchangeInputSchema,
  type AuthMeResponse,
  type OAuthFailureCode,
  type OAuthHandoffExchangeInput,
  type OAuthHandoffExchangeResponse,
} from '@linkedout/contracts';
import type { Request, Response } from 'express';

import { OptionalUser } from '../../common/decorators/current-user.decorator';
import { ApiContract, API_ROUTE_CONTRACTS } from '../../common/contracts/api-route-contracts';
import { API_ROUTE_CONTRACTS_V2 } from '../../common/contracts/api-route-contracts-v2';
import { OptionalAuthGuard } from '../../common/guards/optional-auth.guard';
import { StrictOptionalAuthGuard } from '../../common/guards/strict-optional-auth.guard';
import { AppErrors } from '../../common/errors/app-exception';
import { getCookie } from '../../common/http/cookies';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { AppConfigService } from '../../config/app-config.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { AuthExchangeGuard } from './auth-exchange.guard';
import { GithubAuthGuard, GoogleAuthGuard } from './oauth.guards';
import { REFRESH_COOKIE, TokenService } from './token.service';
import { OAUTH_STATE_COOKIE } from './oauth-state';
import type { OAuthRequest } from './oauth.guards';
import { OAuthHandoffService } from './oauth-handoff.service';

@Controller({ path: 'auth', version: ['1', '2'] })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    private readonly users: UsersService,
    private readonly config: AppConfigService,
    private readonly handoffs: OAuthHandoffService,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authGoogleStart)
  googleStart(): void {
    // The guard redirects to Google; this body never runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authGoogleCallback)
  googleCallback(
    @OptionalUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.completeOAuth(user, req, res);
  }

  @Get('github')
  @UseGuards(GithubAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authGithubStart)
  githubStart(): void {
    // The guard redirects to GitHub; this body never runs.
  }

  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authGithubCallback)
  githubCallback(
    @OptionalUser() user: AuthUser | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.completeOAuth(user, req, res);
  }

  /** V1 downgrades an invalid credential to guest. Retained for live v1 consumers. */
  @Get('me')
  @Version('1')
  @UseGuards(OptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authMe)
  meV1(@OptionalUser() user: AuthUser | undefined): Promise<AuthMeResponse> {
    return this.describeViewer(user);
  }

  /**
   * V2 answers "who am I" consistently with every other v2 read: no credential is a guest,
   * but a presented-and-invalid one is a 401 rather than a silent guest downgrade. The
   * downgrade let a client with a dead session read `user: null` here and conclude it was
   * signed out, while every other v2 route 401'd — so it never refreshed.
   */
  @Get('me')
  @Version('2')
  @UseGuards(StrictOptionalAuthGuard)
  @ApiContract(API_ROUTE_CONTRACTS_V2.authMe)
  meV2(@OptionalUser() user: AuthUser | undefined): Promise<AuthMeResponse> {
    return this.describeViewer(user);
  }

  private async describeViewer(user: AuthUser | undefined): Promise<AuthMeResponse> {
    if (!user) {
      return { user: null, needsOnboarding: false };
    }
    const profile = await this.users.getSelfProfile(user.id);
    return { user: profile, needsOnboarding: profile.username.length === 0 };
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.authRefresh)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = getCookie(req, REFRESH_COOKIE);
    if (!token) throw AppErrors.unauthenticated();
    const { user, refreshToken } = await this.auth.rotateRefresh(token);
    this.tokens.setAccessCookie(res, user);
    this.tokens.setRefreshCookie(res, refreshToken);
    return { ok: true };
  }

  @Post('logout')
  @HttpCode(200)
  @ApiContract(API_ROUTE_CONTRACTS.authLogout)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const token = getCookie(req, REFRESH_COOKIE);
    if (token) await this.auth.revokeRefresh(token);
    this.tokens.clearAuthCookies(res);
    return { ok: true };
  }

  @Post('oauth/handoff/exchange')
  @Version('1')
  @HttpCode(200)
  @UseGuards(AuthExchangeGuard)
  @ApiContract(API_ROUTE_CONTRACTS.authOAuthHandoffExchange)
  async exchangeOAuthHandoff(
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodValidationPipe(oauthHandoffExchangeInputSchema))
    input: OAuthHandoffExchangeInput,
  ): Promise<OAuthHandoffExchangeResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const handoff = await this.handoffs.exchange(input.code);
    if (!handoff) throw AppErrors.invalidHandoff();
    return handoff;
  }

  private async completeOAuth(
    user: AuthUser | undefined,
    req: Request,
    res: Response,
  ): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.clearCookie(OAUTH_STATE_COOKIE, {
      domain: this.config.oauthStateCookieDomain,
      path: '/v1/auth',
    });
    if (!user) {
      const oauthReq = req as OAuthRequest;
      const error =
        oauthReq.oauthError ??
        (req.query.error === 'access_denied' ? 'access_denied' : 'oauth_failed');
      res.redirect(this.oauthFailureRedirect(error));
      return;
    }
    const returnTo = (req as OAuthRequest).oauthReturnTo;
    if (!returnTo) {
      res.redirect(this.oauthFailureRedirect('oauth_failed'));
      return;
    }
    if (this.config.oauthSessionMode === 'handoff') {
      const code = await this.handoffs.issue(user.id, returnTo);
      this.tokens.clearAuthCookies(res);
      res.redirect(`${this.config.webUrl}/auth/callback?code=${encodeURIComponent(code)}`);
      return;
    }

    const { refreshToken } = await this.auth.startSession(user);
    this.tokens.setAuthCookies(res, user, refreshToken);
    res.redirect(`${this.config.webUrl}/auth/callback?returnTo=${encodeURIComponent(returnTo)}`);
  }

  private oauthFailureRedirect(code: OAuthFailureCode): string {
    const query = new URLSearchParams({ error: code });
    return `${this.config.webUrl}/auth/callback?${query.toString()}`;
  }
}
