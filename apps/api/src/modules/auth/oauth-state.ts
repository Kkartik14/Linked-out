import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { isSafeReturnTo } from '@linkedout/contracts';

/** Signed, nonce-bound OAuth state carrying the `returnTo` path through the provider. */

export const OAUTH_STATE_COOKIE = 'lo_oauth_state';

const STATE_TTL_MS = 10 * 60 * 1000;

interface OAuthStatePayload {
  returnTo: string;
  nonce: string;
  exp: number;
}

export interface OAuthState {
  state: string;
  nonce: string;
  maxAgeMs: number;
}

function sign(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createOAuthState(returnTo: string, secret: string): OAuthState {
  const safe = isSafeReturnTo(returnTo) ? returnTo : '/';
  const payload: OAuthStatePayload = {
    returnTo: safe,
    nonce: randomBytes(24).toString('base64url'),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    state: `${body}.${sign(body, secret)}`,
    nonce: payload.nonce,
    maxAgeMs: STATE_TTL_MS,
  };
}

export function decodeOAuthState(
  state: unknown,
  nonceCookie: string | null,
  secret: string,
): string | null {
  if (typeof state !== 'string' || !nonceCookie) return null;
  const [body, signature, extra] = state.split('.');
  if (!body || !signature || extra !== undefined) return null;
  if (!safeEqual(signature, sign(body, secret))) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    !('returnTo' in parsed) ||
    !('nonce' in parsed) ||
    !('exp' in parsed)
  ) {
    return null;
  }
  const payload = parsed as Partial<OAuthStatePayload>;
  if (
    typeof payload.returnTo !== 'string' ||
    typeof payload.nonce !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp < Date.now() ||
    payload.nonce !== nonceCookie ||
    !isSafeReturnTo(payload.returnTo)
  ) {
    return null;
  }
  return payload.returnTo;
}
