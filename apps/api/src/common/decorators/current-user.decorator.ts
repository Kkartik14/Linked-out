import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

import { AppErrors } from '../errors/app-exception';
import type { AuthUser, AuthedRequest } from '../types/auth';

/** Injects the authenticated user. Use on routes guarded by JwtAuthGuard (always present). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const request = ctx.switchToHttp().getRequest<AuthedRequest>();
    if (!request.user) {
      throw AppErrors.unauthenticated();
    }
    return request.user;
  },
);

/** Injects the user if authenticated, else undefined. Use on optional-auth routes. */
export const OptionalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    return ctx.switchToHttp().getRequest<AuthedRequest>().user;
  },
);
