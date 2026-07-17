import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import {
  INTERNAL_AUTH_HEADER,
  InternalAssertionVerifier,
} from '@linkedout/internal-auth';
import type { Request } from 'express';

import { AppErrors } from '../../common/errors/app-exception';
import { AppConfigService } from '../../config/app-config.service';

/** Purpose-specific caller authentication for the private OAuth handoff exchange. */
@Injectable()
export class AuthExchangeGuard implements CanActivate {
  private readonly verifier: InternalAssertionVerifier | undefined;

  constructor(config: AppConfigService) {
    this.verifier = config.internalApiSecret
      ? new InternalAssertionVerifier(config.internalApiSecret)
      : undefined;
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const assertion = request.headers[INTERNAL_AUTH_HEADER];
    if (typeof assertion !== 'string') throw AppErrors.unauthenticated();

    const verification = this.verifier?.verifyAuthExchange(assertion) ?? {
      kind: 'invalid' as const,
    };
    if (verification.kind === 'expired') throw AppErrors.tokenExpired();
    if (verification.kind !== 'authenticated') throw AppErrors.unauthenticated();
    return true;
  }
}
