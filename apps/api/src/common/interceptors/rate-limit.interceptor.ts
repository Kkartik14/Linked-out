import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Request, Response } from 'express';

import { AppErrors } from '../errors/app-exception';
import type { AuthedRequest } from '../types/auth';
import { RateLimitRepository } from '../rate-limit/rate-limit.repository';

type BucketKind = 'read' | 'write';

const WINDOW_MS = 60_000;
const READ_LIMIT = 120;
const WRITE_LIMIT = 30;

function kindFor(method: string): BucketKind {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' ? 'read' : 'write';
}

function clientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function identity(req: AuthedRequest): string {
  return req.user ? `user:${req.user.id}` : `ip:${clientIp(req)}`;
}

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private cleanupCounter = 0;

  constructor(private readonly repo: RateLimitRepository) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const kind = kindFor(req.method);
    const limit = kind === 'read' ? READ_LIMIT : WRITE_LIMIT;
    const now = Date.now();
    const key = `${kind}:${identity(req)}`;
    const bucket = await this.repo.hitBucket(key, WINDOW_MS, now);

    if (bucket.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      throw AppErrors.rateLimited();
    }

    this.cleanupCounter += 1;
    if (this.cleanupCounter % 1000 === 0) await this.repo.cleanupExpired(now - WINDOW_MS);
    return next.handle();
  }
}
