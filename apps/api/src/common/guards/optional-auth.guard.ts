import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import type { AuthUser } from '../types/auth';

/** Attaches the user when a valid token is present, but never blocks the request. */
@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = AuthUser>(_err: unknown, user: TUser | false): TUser | undefined {
    return user === false ? undefined : user;
  }
}
