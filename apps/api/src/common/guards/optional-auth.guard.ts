import { Injectable, UnauthorizedException } from '@nestjs/common';

import type { AuthUser } from '../types/auth';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Legacy v1 leniency applies only to credential errors; infrastructure failures still surface. */
@Injectable()
export class OptionalAuthGuard extends JwtAuthGuard {
  override handleRequest<TUser = AuthUser>(err: unknown, user: TUser | false): TUser | undefined {
    if (err && !(err instanceof UnauthorizedException)) throw err;
    return user === false || user === null || user === undefined ? undefined : user;
  }
}
