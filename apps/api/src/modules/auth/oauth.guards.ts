import { Injectable, Logger, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { oauthStartQuerySchema, type OAuthFailureCode } from '@linkedout/contracts';
import type { CookieOptions, Request, Response } from 'express';

import { AppErrors, isAppExceptionBody } from '../../common/errors/app-exception';
import { getCookie } from '../../common/http/cookies';
import { zodErrorToFieldErrors } from '../../common/pipes/zod-validation.pipe';
import type { AuthUser } from '../../common/types/auth';
import { AppConfigService } from '../../config/app-config.service';
import { createOAuthState, decodeOAuthState, OAUTH_STATE_COOKIE } from './oauth-state';

interface OAuthAuthenticateOptions {
  state?: string;
}

export interface OAuthRequest extends Request {
  oauthError?: OAuthFailureCode;
}

function stateCookieOptions(config: AppConfigService, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    domain: config.cookieDomain,
    path: '/v1/auth',
    maxAge: maxAgeMs,
  };
}

function stateFromRequest(
  context: ExecutionContext,
  config: AppConfigService,
): OAuthAuthenticateOptions {
  const req = context.switchToHttp().getRequest<Request>();
  const res = context.switchToHttp().getResponse<Response>();
  const parsed = oauthStartQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw AppErrors.validation(zodErrorToFieldErrors(parsed.error));
  }
  const returnTo = parsed.data.returnTo ?? '/';
  const state = createOAuthState(returnTo, config.jwtAccessSecret);
  res.cookie(OAUTH_STATE_COOKIE, state.nonce, stateCookieOptions(config, state.maxAgeMs));
  return { state: state.state };
}

function isCallbackRequest(req: Request): boolean {
  const path = req.path || req.url.split('?')[0] || '';
  return path.endsWith('/callback');
}

function callbackStateIsValid(context: ExecutionContext, config: AppConfigService): boolean {
  const req = context.switchToHttp().getRequest<Request>();
  const returnTo = decodeOAuthState(
    req.query.state,
    getCookie(req, OAUTH_STATE_COOKIE),
    config.jwtAccessSecret,
  );
  if (returnTo) return true;

  const oauthReq = req as OAuthRequest;
  oauthReq.oauthError = req.query.error === 'access_denied' ? 'access_denied' : 'oauth_failed';
  return false;
}

const oauthLogger = new Logger('OAuth');

function rememberOAuthError(context: ExecutionContext | undefined, err: unknown): void {
  const response = err && typeof err === 'object' && 'response' in err ? err.response : null;
  const emailTaken =
    response !== null && isAppExceptionBody(response) && response.code === 'EMAIL_TAKEN';

  // `email_taken` is a user-facing outcome the flow expects. Anything else that throws here is
  // a failure of ours — a provider or database outage — and the callback answers every one of
  // them with the same 302 the user sees when they decline consent. Without this line that
  // outage leaves no trace at all: the request log records a successful redirect.
  if (!emailTaken) {
    oauthLogger.error(
      'OAuth callback failed; redirecting as oauth_failed',
      err instanceof Error ? err.stack : String(err),
    );
  }

  const req = context?.switchToHttp().getRequest<OAuthRequest>();
  if (!req) return;
  req.oauthError = emailTaken ? 'email_taken' : 'oauth_failed';
}

/** OAuth guards carry `returnTo` through the flow as `state`, and never block the callback. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    if (!this.config.google.configured) throw AppErrors.providerNotConfigured('Google');
    const req = context.switchToHttp().getRequest<Request>();
    if (isCallbackRequest(req) && !callbackStateIsValid(context, this.config)) return true;
    return super.canActivate(context);
  }

  override getAuthenticateOptions(context: ExecutionContext): OAuthAuthenticateOptions {
    const req = context.switchToHttp().getRequest<Request>();
    if (isCallbackRequest(req)) return {};
    return stateFromRequest(context, this.config);
  }

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context?: ExecutionContext,
  ): TUser | undefined {
    if (err) rememberOAuthError(context, err);
    return user === false ? undefined : user;
  }
}

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  constructor(private readonly config: AppConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext): ReturnType<CanActivate['canActivate']> {
    if (!this.config.github.configured) throw AppErrors.providerNotConfigured('GitHub');
    const req = context.switchToHttp().getRequest<Request>();
    if (isCallbackRequest(req) && !callbackStateIsValid(context, this.config)) return true;
    return super.canActivate(context);
  }

  override getAuthenticateOptions(context: ExecutionContext): OAuthAuthenticateOptions {
    const req = context.switchToHttp().getRequest<Request>();
    if (isCallbackRequest(req)) return {};
    return stateFromRequest(context, this.config);
  }

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    _info: unknown,
    context?: ExecutionContext,
  ): TUser | undefined {
    if (err) rememberOAuthError(context, err);
    return user === false ? undefined : user;
  }
}
