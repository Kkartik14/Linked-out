import {
  Injectable,
  SetMetadata,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  BffCallerAssertionVerifier,
  INTERNAL_AUTH_HEADER,
  type BffCallerPurpose,
} from '@linkedout/internal-auth';
import type { Request, Response } from 'express';

import { markVerifiedBffCaller } from '../../common/auth/verified-bff-caller';
import { AppErrors } from '../../common/errors/app-exception';
import { clientIp } from '../../common/http/client-ip';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { AppConfigService } from '../../config/app-config.service';

const BFF_CALLER_PURPOSE = Symbol('bff-caller-purpose');
const REJECTED_CALLER_LIMIT = 30;
const REJECTED_CALLER_WINDOW_MS = 60_000;

/** Declares the exact BFF capability a private handler accepts. */
export const RequireBffCaller = (purpose: BffCallerPurpose): MethodDecorator =>
  SetMetadata(BFF_CALLER_PURPOSE, purpose);

/** Verifies a purpose-scoped BFF caller assertion and marks it for internal rate limiting. */
@Injectable()
export class BffCallerGuard implements CanActivate {
  private readonly verifier: BffCallerAssertionVerifier | undefined;

  constructor(
    config: AppConfigService,
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {
    this.verifier = config.bffCallerSecret
      ? new BffCallerAssertionVerifier(config.bffCallerSecret)
      : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const purpose = this.reflector.get<BffCallerPurpose>(
      BFF_CALLER_PURPOSE,
      context.getHandler(),
    );
    if (!purpose) throw new Error('BffCallerGuard requires @RequireBffCaller on its handler.');

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const assertion = request.headers[INTERNAL_AUTH_HEADER];
    if (typeof assertion !== 'string') {
      return this.reject(request, response, AppErrors.unauthenticated());
    }

    const verification = this.verifier?.verify(assertion, purpose) ?? {
      kind: 'invalid' as const,
    };
    if (verification.kind === 'expired') {
      return this.reject(request, response, AppErrors.tokenExpired());
    }
    if (verification.kind !== 'authenticated') {
      return this.reject(request, response, AppErrors.unauthenticated());
    }

    markVerifiedBffCaller(request, purpose);
    return true;
  }

  private async reject(request: Request, response: Response, error: Error): Promise<never> {
    const decision = await this.limiter.take({
      key: `internal-rejected:ip:${clientIp(request)}`,
      limit: REJECTED_CALLER_LIMIT,
      windowMs: REJECTED_CALLER_WINDOW_MS,
    });
    if (!decision.allowed) {
      response.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw AppErrors.rateLimited();
    }
    throw error;
  }
}
