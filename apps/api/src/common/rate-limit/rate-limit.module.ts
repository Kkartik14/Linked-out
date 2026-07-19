import { Global, Module } from '@nestjs/common';

import { RateLimitRepository } from './rate-limit.repository';
import { RATE_LIMITER_OPTIONS, RateLimiter } from './rate-limiter';

export const PRODUCTION_RATE_LIMITER_OPTIONS = Object.freeze({
  reservedLocalKeys: 3,
  reservedKeyPrefixes: Object.freeze(['internal:bff:']),
});

/** One process-local lease cache over the shared PostgreSQL rate-limit authority. */
@Global()
@Module({
  providers: [
    RateLimitRepository,
    {
      provide: RATE_LIMITER_OPTIONS,
      useValue: PRODUCTION_RATE_LIMITER_OPTIONS,
    },
    RateLimiter,
  ],
  exports: [RateLimiter],
})
export class RateLimitModule {}
