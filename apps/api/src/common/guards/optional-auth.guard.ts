import { Injectable, type ExecutionContext } from '@nestjs/common';

import { ACCESS_COOKIE, getCookie } from '../http/cookies';
import type { AuthedRequest } from '../types/auth';
import { JwtAuthGuard } from './jwt-auth.guard';

/** Allows a credential-absent guest, but validates every presented access credential. */
@Injectable()
export class OptionalAuthGuard extends JwtAuthGuard {
  override canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!this.hasInternalCredential(context) && getCookie(request, ACCESS_COOKIE) === null) {
      return true;
    }
    return super.canActivate(context);
  }
}
