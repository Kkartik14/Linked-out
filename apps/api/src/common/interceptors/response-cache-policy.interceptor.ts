import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { Response } from 'express';

export const DEFAULT_PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';

/** Fail-closed cache policy for every response without an explicit public override. */
@Injectable()
export class ResponseCachePolicyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const response = context.switchToHttp().getResponse<Response>();
      if (!response.hasHeader('Cache-Control')) {
        response.setHeader('Cache-Control', DEFAULT_PRIVATE_CACHE_CONTROL);
      }
    }
    return next.handle();
  }
}
