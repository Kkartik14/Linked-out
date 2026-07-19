import { ArgumentsHost, Catch, HttpException, Logger, type ExceptionFilter } from '@nestjs/common';
import type { ErrorEnvelope } from '@linkedout/contracts';
import type { Request, Response } from 'express';

import { AppException, isAppExceptionBody } from '../errors/app-exception';

const STATUS_TO_CODE: Readonly<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

const SECURITY_REJECTION_CODES = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'PRINCIPAL_MISMATCH',
  'INVALID_HANDOFF',
  'CSRF_REJECTED',
]);

function requestPath(req: Request): string {
  return req.path || req.url.split('?')[0] || '/';
}

function extractMessage(response: string | object): string {
  if (typeof response === 'string') {
    return response;
  }
  if ('message' in response) {
    const message = (response as { message: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map(String).join(', ');
    }
  }
  return 'Request failed.';
}

/** Renders every thrown error as the `{ error: { code, message, details? } }` envelope. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const req = host.switchToHttp().getRequest<Request>();

    if (exception instanceof AppException) {
      const body = exception.getResponse();
      if (isAppExceptionBody(body)) {
        if (SECURITY_REJECTION_CODES.has(body.code)) {
          // Never include headers, cookies, query strings, bodies, or exception text here: each
          // may contain a browser credential, OAuth code, or internal assertion.
          this.logger.warn(
            `security_rejection code=${body.code} method=${req.method} path=${requestPath(req)}`,
          );
        }
        const envelope: ErrorEnvelope = {
          error: { code: body.code, message: body.message, details: body.details },
        };
        res.status(exception.getStatus()).json(envelope);
        return;
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const envelope: ErrorEnvelope = {
        error: {
          code: STATUS_TO_CODE[status] ?? 'ERROR',
          message: extractMessage(exception.getResponse()),
        },
      };
      res.status(status).json(envelope);
      return;
    }

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : String(exception),
    );
    const envelope: ErrorEnvelope = {
      error: { code: 'INTERNAL', message: 'Something went wrong.' },
    };
    res.status(500).json(envelope);
  }
}
