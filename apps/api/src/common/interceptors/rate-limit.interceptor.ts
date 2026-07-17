import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Response } from 'express';

import { AppErrors } from '../errors/app-exception';
import { clientIp } from '../http/client-ip';
import type { AuthedRequest } from '../types/auth';
import { RateLimiter } from '../rate-limit/rate-limiter';
import { verifiedBffCallerPurpose } from '../auth/verified-bff-caller';

type BucketKind = 'read' | 'write';

const WINDOW_MS = 60_000;
const READ_LIMIT = 120;
const WRITE_LIMIT = 30;
const BFF_CALLER_LIMITS = {
  'auth-exchange': 300,
  'session-resolve': 6_000,
  'session-revoke': 600,
} as const;

function kindFor(method: string): BucketKind {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
}

function identity(req: AuthedRequest): string {
  return req.user ? `user:${req.user.id}` : `ip:${clientIp(req)}`;
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(private readonly limiter: RateLimiter) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const callerPurpose = verifiedBffCallerPurpose(req);
    const kind = callerPurpose ? 'internal' : kindFor(req.method);
    const limit = callerPurpose
      ? BFF_CALLER_LIMITS[callerPurpose]
      : kind === 'read'
        ? READ_LIMIT
        : WRITE_LIMIT;
    const now = Date.now();
    const key = callerPurpose
      ? `${kind}:bff:${callerPurpose}`
      : `${kind}:${identity(req)}`;
    const decision = await this.limiter.take({ key, limit, windowMs: WINDOW_MS, nowMs: now });

    if (!decision.allowed) {
      res.setHeader('Retry-After', String(decision.retryAfterSeconds));
      throw AppErrors.rateLimited();
    }

    return next.handle();
  }
}
