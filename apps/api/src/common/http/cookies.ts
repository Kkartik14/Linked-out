import type { Request } from 'express';

/** Reads a string cookie by name (cookie-parser populates req.cookies). */
export function getCookie(req: Request, name: string): string | null {
  const cookies: unknown = req.cookies;
  if (cookies !== null && typeof cookies === 'object' && name in cookies) {
    const value = (cookies as Record<string, unknown>)[name];
    return typeof value === 'string' ? value : null;
  }
  return null;
}
