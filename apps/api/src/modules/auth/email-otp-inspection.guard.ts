import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { EMAIL_OTP_INSPECTION_HEADER } from '@linkedout/contracts';
import type { Request } from 'express';

import { AppErrors } from '../../common/errors/app-exception';
import { AppConfigService } from '../../config/app-config.service';
import { EmailOtpCrypto } from './email-otp.crypto';

@Injectable()
export class EmailOtpInspectionGuard implements CanActivate {
  constructor(
    private readonly config: AppConfigService,
    private readonly crypto: EmailOtpCrypto,
  ) {}

  canActivate(context: ExecutionContext): true {
    const request = context.switchToHttp().getRequest<Request>();
    const value = request.header(EMAIL_OTP_INSPECTION_HEADER);
    if (
      this.config.emailOtp.deliveryMode !== 'stub' ||
      !this.crypto.inspectionSecretMatches(value)
    ) {
      throw AppErrors.unauthenticated();
    }
    return true;
  }
}
