import type { Request } from 'express';

/** Returns a credential-safe request path for logs and telemetry. */
export function requestPathForLogging(request: Pick<Request, 'path' | 'url'>): string {
  return request.path || request.url.split('?')[0] || '/';
}
