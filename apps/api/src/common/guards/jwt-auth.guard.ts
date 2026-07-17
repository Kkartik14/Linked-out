import {
  Inject,
  Injectable,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { INTERNAL_AUTH_HEADER } from '@linkedout/internal-auth';

import {
  REQUEST_AUTHENTICATION,
  type RequestAuthentication,
} from '../auth/request-authentication';
import { AppErrors } from '../errors/app-exception';
import type { AuthedRequest, AuthUser } from '../types/auth';

function isTokenExpired(info: unknown): boolean {
  return info instanceof Error && info.name === 'TokenExpiredError';
}

/** Requires a valid access-token cookie; 401s otherwise (TOKEN_EXPIRED when applicable). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    @Inject(REQUEST_AUTHENTICATION)
    private readonly requestAuthentication: RequestAuthentication,
  ) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    return this.activateInternal(context) ?? super.canActivate(context);
  }

  protected hasInternalCredential(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    return request.headers[INTERNAL_AUTH_HEADER] !== undefined;
  }

  private activateInternal(context: ExecutionContext): Promise<boolean> | null {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const assertion = request.headers[INTERNAL_AUTH_HEADER];
    if (assertion === undefined) return null;
    if (typeof assertion !== 'string') throw AppErrors.unauthenticated();

    return this.requestAuthentication.authenticateInternal(assertion).then((result) => {
      if (result.kind === 'expired') throw AppErrors.tokenExpired();
      if (result.kind === 'invalid') throw AppErrors.unauthenticated();
      request.user = result.user;
      return true;
    });
  }

  override handleRequest<TUser = AuthUser>(
    err: unknown,
    user: TUser | false,
    info: unknown,
  ): TUser | undefined {
    if (err) {
      if (err instanceof UnauthorizedException) throw AppErrors.unauthenticated();
      throw err;
    }
    if (user === false || user === null || user === undefined) {
      throw isTokenExpired(info) ? AppErrors.tokenExpired() : AppErrors.unauthenticated();
    }
    return user;
  }
}
