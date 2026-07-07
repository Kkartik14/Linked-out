import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { AppErrors } from '../errors/app-exception';
import type { AuthUser } from '../types/auth';

function isTokenExpired(info: unknown): boolean {
  return info instanceof Error && info.name === 'TokenExpiredError';
}

/** Requires a valid access-token cookie; 401s otherwise (TOKEN_EXPIRED when applicable). */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false, info: unknown): TUser {
    if (err || user === false || user === null || user === undefined) {
      throw isTokenExpired(info) ? AppErrors.tokenExpired() : AppErrors.unauthenticated();
    }
    return user;
  }
}
