import { createHmac } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AppErrors } from '../../common/errors/app-exception';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class EmailAuthRateLimiter {
  constructor(
    private readonly limiter: RateLimiter,
    private readonly config: AppConfigService,
  ) {}

  issue(email: string): Promise<void> {
    return this.take('issue', email, 10, 10 * 60_000);
  }

  login(email: string): Promise<void> {
    return this.take('login', email, 10, 15 * 60_000);
  }

  inspect(email: string): Promise<void> {
    return this.take('inspect', email, 30, 60_000);
  }

  private async take(
    operation: string,
    email: string,
    limit: number,
    windowMs: number,
  ): Promise<void> {
    const pepper = this.config.emailOtp.pepper;
    if (!pepper) throw new Error('Email OTP rate-limit pseudonymization is not configured.');
    const identity = createHmac('sha256', pepper)
      .update('linkedout:email-auth-rate-limit:v1\0')
      .update(email)
      .digest('hex');
    const decision = await this.limiter.take({
      key: `email-auth:${operation}:${identity}`,
      limit,
      windowMs,
    });
    if (!decision.allowed) throw AppErrors.rateLimited(decision.retryAfterSeconds);
  }
}
