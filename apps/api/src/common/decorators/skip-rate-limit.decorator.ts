import { SetMetadata } from '@nestjs/common';

export const SKIP_RATE_LIMIT_METADATA = Symbol.for('linkedout:skip-rate-limit');

/** Marks internal operational probes that must not depend on persisted limiter availability. */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_METADATA, true);
