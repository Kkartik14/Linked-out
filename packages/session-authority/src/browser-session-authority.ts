import { createHash, randomBytes } from 'node:crypto';

import {
  BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
  BROWSER_SESSION_IDLE_TIMEOUT_MS,
  type BrowserSessionAuthorityOptions,
  type BrowserSessionAuthorization,
  type BrowserSessionPersistence,
  type BrowserSessionRevocation,
  type CreatedBrowserSession,
  type ExchangedOAuthHandoffSession,
  type PersistedBrowserSession,
} from './browser-session.types';

const COOKIE_BYTES = 32;
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_HASH_DOMAIN = 'linkedout:browser-session:v1:';
const OAUTH_HANDOFF_CODE_HASH_DOMAIN = 'linkedout:oauth-handoff:v1\0';
const MAX_CREATE_ATTEMPTS = 3;

const systemClock = {
  now: (): Date => new Date(),
};

const secureTokenSource = {
  generate: (): string => randomBytes(COOKIE_BYTES).toString('base64url'),
};

function assertValidDate(value: Date, name: string): void {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`${name} must return a valid Date.`);
  }
}

function assertValidGeneratedCookie(cookie: string): void {
  if (!COOKIE_PATTERN.test(cookie)) {
    throw new Error('Browser session token source returned an invalid token.');
  }
}

export function hashBrowserSessionCookie(cookie: string): string {
  return createHash('sha256').update(COOKIE_HASH_DOMAIN).update(cookie).digest('hex');
}

export function hashOAuthHandoffCode(code: string): string {
  return createHash('sha256').update(OAUTH_HANDOFF_CODE_HASH_DOMAIN).update(code).digest('hex');
}

function expiryFor(createdAt: Date, lastUsedAt: Date): Date {
  return new Date(
    Math.min(
      createdAt.getTime() + BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
      lastUsedAt.getTime() + BROWSER_SESSION_IDLE_TIMEOUT_MS,
    ),
  );
}

function cookieExpiryFor(createdAt: Date): Date {
  return new Date(createdAt.getTime() + BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS);
}

function createdSession(cookie: string, session: PersistedBrowserSession): CreatedBrowserSession {
  return {
    cookie,
    cookieExpiresAt: cookieExpiryFor(session.createdAt),
    ...session,
    expiresAt: expiryFor(session.createdAt, session.lastUsedAt),
  };
}

/**
 * Authoritative browser-session policy and orchestration.
 *
 * Credential parsing, opaque-token generation, collision retries, timeout policy, and result
 * semantics live here. Database CRUD, row locking, transactions, and raw SQL are hidden behind
 * the injected persistence seam. Store failures deliberately propagate rather than becoming a
 * guest result.
 */
export class BrowserSessionAuthority {
  private readonly clock;
  private readonly tokenSource;

  constructor(
    private readonly persistence: BrowserSessionPersistence,
    options: BrowserSessionAuthorityOptions = {},
  ) {
    this.clock = options.clock ?? systemClock;
    this.tokenSource = options.tokenSource ?? secureTokenSource;
  }

  async create(sub: string): Promise<CreatedBrowserSession> {
    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');

    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const cookie = this.tokenSource.generate();
      assertValidGeneratedCookie(cookie);
      const result = await this.persistence.create({
        cookieHash: hashBrowserSessionCookie(cookie),
        sub,
        now,
      });
      if (result.kind === 'created') return createdSession(cookie, result.session);
    }

    throw new Error('Browser session creation exhausted its collision retry budget.');
  }

  /** Atomically consumes a one-time OAuth handoff and creates its authoritative session. */
  async exchangeOAuthHandoff(code: string): Promise<ExchangedOAuthHandoffSession | null> {
    if (!COOKIE_PATTERN.test(code)) return null;
    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');
    const codeHash = hashOAuthHandoffCode(code);

    for (let attempt = 1; attempt <= MAX_CREATE_ATTEMPTS; attempt += 1) {
      const cookie = this.tokenSource.generate();
      assertValidGeneratedCookie(cookie);
      const result = await this.persistence.exchangeOAuthHandoff({
        codeHash,
        cookieHash: hashBrowserSessionCookie(cookie),
        now,
      });
      if (result.kind === 'invalid-handoff') return null;
      if (result.kind === 'exchanged') {
        return {
          ...createdSession(cookie, result.session),
          returnTo: result.returnTo,
        };
      }
    }

    throw new Error('OAuth session exchange exhausted its collision retry budget.');
  }

  async authorize(cookie: string | undefined): Promise<BrowserSessionAuthorization> {
    if (cookie === undefined) return { kind: 'absent' };
    if (!COOKIE_PATTERN.test(cookie)) return { kind: 'invalid' };

    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');
    return this.persistence.authorize({
      cookieHash: hashBrowserSessionCookie(cookie),
      now,
      idleTimeoutMs: BROWSER_SESSION_IDLE_TIMEOUT_MS,
      absoluteTimeoutMs: BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
    });
  }

  async revoke(cookie: string | undefined): Promise<BrowserSessionRevocation> {
    if (cookie === undefined || !COOKIE_PATTERN.test(cookie)) return { revoked: false };
    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');
    return this.persistence.revoke({
      cookieHash: hashBrowserSessionCookie(cookie),
      now,
    });
  }
}
