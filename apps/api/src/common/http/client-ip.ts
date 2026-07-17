import type { Request } from 'express';

/** Express has already applied the configured exact proxy-hop trust before this is read. */
export function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
