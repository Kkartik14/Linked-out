import { Buffer } from 'node:buffer';

import jwt, { type Jwt, type JwtPayload } from 'jsonwebtoken';

export const INTERNAL_AUTH_HEADER = 'x-internal-auth';
export const BFF_CALLER_ASSERTION_ISSUER = 'bff';
export const API_ASSERTION_ISSUER = 'linkedout-api';
export const API_ASSERTION_AUDIENCE = 'api';
export const AUTH_EXCHANGE_ASSERTION_AUDIENCE = 'auth-exchange';
export const SESSION_RESOLVE_ASSERTION_AUDIENCE = 'session-resolve';
export const SESSION_REVOKE_ASSERTION_AUDIENCE = 'session-revoke';
export const INTERNAL_ASSERTION_TTL_SECONDS = 60;

const API_TOKEN_TYPE = 'linkedout+api-session';
const AUTH_EXCHANGE_TOKEN_TYPE = 'linkedout+bff-auth-exchange';
const SESSION_RESOLVE_TOKEN_TYPE = 'linkedout+bff-session-resolve';
const SESSION_REVOKE_TOKEN_TYPE = 'linkedout+bff-session-revoke';
const MAX_ASSERTION_LENGTH = 2048;
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type BffCallerPurpose = 'auth-exchange' | 'session-resolve' | 'session-revoke';

export interface InternalAuthClock {
  now(): Date;
}

export interface ApiAssertionClaims {
  sub: string;
  sid: string;
  iat: number;
  exp: number;
}

export interface BffCallerAssertionClaims {
  iat: number;
  exp: number;
}

export interface SignedApiAssertion {
  assertion: string;
  expiresAt: Date;
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

interface VerificationProfile {
  audience: string;
  issuer: string;
  tokenType: string;
  payloadKeys: readonly string[];
}

interface SignedAssertion {
  assertion: string;
  expiresAtSeconds: number;
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

function signAssertion(
  payload: Record<string, string>,
  secret: string,
  clock: InternalAuthClock,
  profile: VerificationProfile,
): SignedAssertion {
  const iat = nowInSeconds(clock);
  const exp = iat + INTERNAL_ASSERTION_TTL_SECONDS;
  return {
    assertion: jwt.sign({ ...payload, iat, exp }, secret, {
      algorithm: 'HS256',
      issuer: profile.issuer,
      audience: profile.audience,
      header: { alg: 'HS256', typ: profile.tokenType },
    }),
    expiresAtSeconds: exp,
  };
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
      issuer: profile.issuer,
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
    decoded.payload.iss !== profile.issuer ||
    decoded.payload.aud !== profile.audience ||
    !exactKeys(decoded.payload, profile.payloadKeys) ||
    !hasFreshLifetime(decoded.payload, now)
  ) {
    return { kind: 'invalid' };
  }
  return { kind: 'authenticated', claims: decoded.payload };
}

const API_PROFILE: VerificationProfile = {
  audience: API_ASSERTION_AUDIENCE,
  issuer: API_ASSERTION_ISSUER,
  tokenType: API_TOKEN_TYPE,
  payloadKeys: ['aud', 'exp', 'iat', 'iss', 'sid', 'sub'],
};

const BFF_CALLER_PROFILES = {
  'auth-exchange': {
    audience: AUTH_EXCHANGE_ASSERTION_AUDIENCE,
    issuer: BFF_CALLER_ASSERTION_ISSUER,
    tokenType: AUTH_EXCHANGE_TOKEN_TYPE,
    payloadKeys: ['aud', 'exp', 'iat', 'iss'],
  },
  'session-resolve': {
    audience: SESSION_RESOLVE_ASSERTION_AUDIENCE,
    issuer: BFF_CALLER_ASSERTION_ISSUER,
    tokenType: SESSION_RESOLVE_TOKEN_TYPE,
    payloadKeys: ['aud', 'exp', 'iat', 'iss'],
  },
  'session-revoke': {
    audience: SESSION_REVOKE_ASSERTION_AUDIENCE,
    issuer: BFF_CALLER_ASSERTION_ISSUER,
    tokenType: SESSION_REVOKE_TOKEN_TYPE,
    payloadKeys: ['aud', 'exp', 'iat', 'iss'],
  },
} as const satisfies Record<BffCallerPurpose, VerificationProfile>;

/** BFF-only signer. It cannot mint the user assertions accepted by ordinary API routes. */
export class BffCallerAssertionSigner {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  signAuthExchange(): string {
    return this.sign('auth-exchange');
  }

  signSessionResolve(): string {
    return this.sign('session-resolve');
  }

  signSessionRevoke(): string {
    return this.sign('session-revoke');
  }

  private sign(purpose: BffCallerPurpose): string {
    return signAssertion({}, this.secret, this.clock, BFF_CALLER_PROFILES[purpose]).assertion;
  }
}

/** Nest-only issuer. Its key never enters the public web tier. */
export class ApiAssertionSigner {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  sign(input: { sub: string; sid: string }): SignedApiAssertion {
    assertUlid(input.sub, 'sub');
    assertUlid(input.sid, 'sid');
    const signed = signAssertion(
      { sub: input.sub, sid: input.sid },
      this.secret,
      this.clock,
      API_PROFILE,
    );
    return {
      assertion: signed.assertion,
      expiresAt: new Date(signed.expiresAtSeconds * 1000),
    };
  }
}

/** Strict verifier for API-issued user assertions. */
export class ApiAssertionVerifier {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  verify(token: string | undefined): AssertionVerification<ApiAssertionClaims> {
    const result = verifiedPayload(token, this.secret, this.clock, API_PROFILE);
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
}

/** Strict verifier for purpose-scoped BFF caller assertions. */
export class BffCallerAssertionVerifier {
  constructor(
    private readonly secret: string,
    private readonly clock: InternalAuthClock = systemClock,
  ) {
    assertSecret(secret);
  }

  verify(
    token: string | undefined,
    purpose: BffCallerPurpose,
  ): AssertionVerification<BffCallerAssertionClaims> {
    const result = verifiedPayload(token, this.secret, this.clock, BFF_CALLER_PROFILES[purpose]);
    if (result.kind !== 'authenticated') return result;
    return {
      kind: 'authenticated',
      claims: { iat: result.claims.iat, exp: result.claims.exp },
    };
  }
}
