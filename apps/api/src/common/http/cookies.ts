import type { Request } from 'express';

export const ACCESS_COOKIE = 'lo_access';
export const REFRESH_COOKIE = 'lo_refresh';

/** Reads a string cookie by name (cookie-parser populates req.cookies). */
export function getCookie(req: Request, name: string): string | null {
  const cookies: unknown = req.cookies;
  if (cookies !== null && typeof cookies === 'object' && name in cookies) {
    const value = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  }
  return null;
}
