import {
  HttpException,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { catchError, tap, throwError } from 'rxjs';
import type { Request, Response } from 'express';

import type { AuthedRequest } from '../types/auth';

function statusFromError(error: unknown): number {
  return error instanceof HttpException ? error.getStatus() : 500;
}

function pathFor(req: Request): string {
  return req.path || req.url.split('?')[0] || '/';
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => this.log(req, res.statusCode, start)),
      catchError((error: unknown) => {
        this.log(req, statusFromError(error), start);
        return throwError(() => error);
      }),
    );
  }

  private log(req: AuthedRequest, status: number, start: number): void {
    const durationMs = Date.now() - start;
    const userPart = req.user ? ` user=${req.user.id}` : '';
    this.logger.log(`${req.method} ${pathFor(req)} ${status} ${durationMs}ms${userPart}`);
  }
}
