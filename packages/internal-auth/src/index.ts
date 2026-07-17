import { Buffer } from 'node:buffer';

import jwt, { type Jwt, type JwtPayload } from 'jsonwebtoken';

export const INTERNAL_AUTH_HEADER = 'x-internal-auth';
export const INTERNAL_ASSERTION_ISSUER = 'bff';
export const API_ASSERTION_AUDIENCE = 'api';
export const AUTH_EXCHANGE_ASSERTION_AUDIENCE = 'auth-exchange';
export const INTERNAL_ASSERTION_TTL_SECONDS = 60;

const API_TOKEN_TYPE = 'linkedout+bff-api';
const EXCHANGE_TOKEN_TYPE = 'linkedout+bff-auth-exchange';
const MAX_ASSERTION_LENGTH = 2048;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export interface InternalAuthClock {
  now(): Date;
}

export interface ApiAssertionClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

export interface AuthExchangeAssertionClaims {
  iat: number;
  exp: number;
}

export type AssertionVerification<TClaims> =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'authenticated'; claims: TClaims };

const systemClock: InternalAuthClock = { now: () => new Date() };

function nowInSeconds(clock: InternalAuthClock): number {
  const now = clock.now();
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new Error('InternalAuthClock.now() must return a valid Date.');
  }
  return Math.floor(now.getTime() / 1000);
}

function assertSecret(secret: string): void {
  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('Internal assertion secret must contain at least 32 bytes.');
  }
}

function assertUlid(value: string, field: 'sub' | 'sid'): void {
  if (!ULID_PATTERN.test(value)) {
    throw new Error(`Internal assertion ${field} must be a ULID.`);
  }
}

function exactKeys(payload: JwtPayload, expected: readonly string[]): boolean {
  const actual = Object.keys(payload).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

interface FreshJwtPayload extends JwtPayload {
  iat: number;
  exp: number;
}

function hasFreshLifetime(payload: JwtPayload, now: number): payload is FreshJwtPayload {
  const iat = payload.iat;
  const exp = payload.exp;
  return (
    typeof iat === 'number' &&
    typeof exp === 'number' &&
    Number.isSafeInteger(iat) &&
    Number.isSafeInteger(exp) &&
    iat <= now &&
    exp > now &&
    exp > iat &&
    exp - iat <= INTERNAL_ASSERTION_TTL_SECONDS
  );
}

interface VerificationProfile {
  audience: typeof API_ASSERTION_AUDIENCE | typeof AUTH_EXCHANGE_ASSERTION_AUDIENCE;
  tokenType: typeof API_TOKEN_TYPE | typeof EXCHANGE_TOKEN_TYPE;
  payloadKeys: readonly string[];
}

function verifiedPayload(
  token: string | undefined,
  secret: string,
  clock: InternalAuthClock,
  profile: VerificationProfile,
): AssertionVerification<FreshJwtPayload> {
  if (token === undefined) return { kind: 'absent' };
  if (token.length === 0 || token.length > MAX_ASSERTION_LENGTH) return { kind: 'invalid' };

  const now = nowInSeconds(clock);
  let decoded: Jwt;
  try {
    decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: profile.audience,
      issuer: INTERNAL_ASSERTION_ISSUER,
      clockTimestamp: now,
      complete: true,
    });
  } catch (error) {
    return error instanceof jwt.TokenExpiredError ? { kind: 'expired' } : { kind: 'invalid' };
  }

  if (
    decoded.header.alg !== 'HS256' ||
    decoded.header.typ !== profile.tokenType ||
    typeof decoded.payload === 'string' ||
    decoded.payload.iss !== INTERNAL_ASSERTION_ISSUER ||
    decoded.payload.aud !== profile.audience ||
    !exactKeys(decoded.payload, profile.payloadKeys) ||
    !hasFreshLifetime(decoded.payload, now)
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'authenticated', claims: decoded.payload };
}

/** BFF-only signer. Nest consumers should depend on InternalAssertionVerifier instead. */
export class InternalAssertionSigner {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  signApi(input: { sub: string; sid: string }): string {
    assertUlid(input.sub, 'sub');
    assertUlid(input.sid, 'sid');
    return this.sign(
      { sub: input.sub, sid: input.sid },
      API_ASSERTION_AUDIENCE,
      API_TOKEN_TYPE,
    );
  }

  signAuthExchange(): string {
    return this.sign({}, AUTH_EXCHANGE_ASSERTION_AUDIENCE, EXCHANGE_TOKEN_TYPE);
  }

  private sign(
    payload: Record<string, string>,
    audience: VerificationProfile['audience'],
    tokenType: VerificationProfile['tokenType'],
  ): string {
    const iat = nowInSeconds(this.clock);
    return jwt.sign(
      { ...payload, iat, exp: iat + INTERNAL_ASSERTION_TTL_SECONDS },
      this.secret,
      {
        algorithm: 'HS256',
        issuer: INTERNAL_ASSERTION_ISSUER,
        audience,
        header: { alg: 'HS256', typ: tokenType },
      },
    );
  }
}

/** Strict Nest-side verifier with separate profiles for ordinary API and handoff exchange. */
export class InternalAssertionVerifier {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  verifyApi(token: string | undefined): AssertionVerification<ApiAssertionClaims> {
    const result = verifiedPayload(token, this.secret, this.clock, {
      audience: API_ASSERTION_AUDIENCE,
      tokenType: API_TOKEN_TYPE,
      payloadKeys: ['aud', 'exp', 'iat', 'iss', 'sid', 'sub'],
    });
    if (result.kind !== 'authenticated') return result;
    const payload = result.claims;
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !ULID_PATTERN.test(payload.sub) ||
      !ULID_PATTERN.test(payload.sid)
    ) {
      return { kind: 'invalid' };
    }
    return {
      kind: 'authenticated',
      claims: { sub: payload.sub, sid: payload.sid, iat: payload.iat, exp: payload.exp },
    };
  }

  verifyAuthExchange(token: string | undefined): AssertionVerification<AuthExchangeAssertionClaims> {
    const result = verifiedPayload(token, this.secret, this.clock, {
      audience: AUTH_EXCHANGE_ASSERTION_AUDIENCE,
      tokenType: EXCHANGE_TOKEN_TYPE,
      payloadKeys: ['aud', 'exp', 'iat', 'iss'],
    });
    if (result.kind !== 'authenticated') return result;
    return {
      kind: 'authenticated',
      claims: { iat: result.claims.iat, exp: result.claims.exp },
    };
  }
}
