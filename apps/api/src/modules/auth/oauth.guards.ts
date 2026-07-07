import { Injectable, type ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

import type { AuthUser } from '../../common/types/auth';
import { encodeReturnTo } from './oauth-state';

interface OAuthAuthenticateOptions {
  state: string;
}

function stateFromRequest(context: ExecutionContext): OAuthAuthenticateOptions {
  const req = context.switchToHttp().getRequest<Request>();
  const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
  return { state: encodeReturnTo(returnTo) };
}

/** OAuth guards carry `returnTo` through the flow as `state`, and never block the callback. */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  override getAuthenticateOptions(context: ExecutionContext): OAuthAuthenticateOptions {
    return stateFromRequest(context);
  }

  override handleRequest<TUser = AuthUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user === false ? undefined : user;
  }
}

@Injectable()
export class GithubAuthGuard extends AuthGuard('github') {
  override getAuthenticateOptions(context: ExecutionContext): OAuthAuthenticateOptions {
    return stateFromRequest(context);
  }

  override handleRequest<TUser = AuthUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user === false ? undefined : user;
  }
}
