import { Injectable } from '@nestjs/common';
import {
  InternalAssertionVerifier,
  type AssertionVerification,
  type ApiAssertionClaims,
} from '@linkedout/internal-auth';

import type {
  InternalRequestAuthentication,
  RequestAuthentication,
} from '../../common/auth/request-authentication';
import { AppConfigService } from '../../config/app-config.service';
import { AccessPrincipalResolver } from './access-principal.resolver';

/** Nest-side trust boundary for BFF assertions. Infrastructure errors deliberately propagate. */
@Injectable()
export class NestRequestAuthentication implements RequestAuthentication {
  private readonly verifier: InternalAssertionVerifier | undefined;

  constructor(
    config: AppConfigService,
    private readonly principals: AccessPrincipalResolver,
  ) {
    this.verifier = config.internalApiSecret
      ? new InternalAssertionVerifier(config.internalApiSecret)
      : undefined;
  }

  async authenticateInternal(assertion: string): Promise<InternalRequestAuthentication> {
    const verification = this.verifier?.verifyApi(assertion) ?? { kind: 'invalid' as const };
    if (verification.kind !== 'authenticated') return this.rejection(verification);

    const { sub, sid, iat, exp } = verification.claims;
    const principal = await this.principals.resolve({ sub, username: null, iat, exp });
    return principal
      ? { kind: 'authenticated', user: principal, sid }
      : { kind: 'invalid' };
  }

  private rejection(
    verification: Exclude<AssertionVerification<ApiAssertionClaims>, { kind: 'authenticated' }>,
  ): InternalRequestAuthentication {
    return verification.kind === 'expired' ? { kind: 'expired' } : { kind: 'invalid' };
  }
}
