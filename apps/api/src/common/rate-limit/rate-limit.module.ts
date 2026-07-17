import { Global, Module } from '@nestjs/common';

import { RateLimitRepository } from './rate-limit.repository';
import { RateLimiter } from './rate-limiter';

/** One process-local lease cache over the shared PostgreSQL rate-limit authority. */
@Global()
@Module({
  providers: [RateLimitRepository, RateLimiter],
  exports: [RateLimiter],
})
export class RateLimitModule {}
