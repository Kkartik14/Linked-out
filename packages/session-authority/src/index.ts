import { createHash, randomBytes } from 'node:crypto';

import { Prisma, type ExtendedPrismaClient } from '@linkedout/db';

export const BROWSER_SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000;
export const BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS = 90 * 24 * 60 * 60 * 1000;
export const REVOKED_BROWSER_SESSION_RETENTION_MS = 60 * 1000;

const COOKIE_BYTES = 32;
const COOKIE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_HASH_DOMAIN = 'linkedout:browser-session:v1:';
const MAX_CREATE_ATTEMPTS = 3;

export interface BrowserSessionClock {
  now(): Date;
}

export interface BrowserSessionTokenSource {
  generate(): string;
}

export interface BrowserSession {
  sid: string;
  sub: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

export interface CreatedBrowserSession extends BrowserSession {
  cookie: string;
}

export type BrowserSessionAuthorization =
  | { kind: 'absent' }
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'authenticated'; session: BrowserSession };

export interface BrowserSessionRevocation {
  revoked: boolean;
}

export interface BrowserSessionAuthorityOptions {
  clock?: BrowserSessionClock;
  tokenSource?: BrowserSessionTokenSource;
}

const systemClock: BrowserSessionClock = {
  now: () => new Date(),
};

const secureTokenSource: BrowserSessionTokenSource = {
  generate: () => randomBytes(COOKIE_BYTES).toString('base64url'),
};

interface AuthorizedRow {
  outcome: 'authenticated';
  sid: string;
  sub: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

interface ExpiredRow {
  outcome: 'expired';
  sid: null;
  sub: null;
  createdAt: null;
  lastUsedAt: null;
  expiresAt: null;
}

interface RevokedRow {
  outcome: 'revoked';
  sid: null;
  sub: null;
  createdAt: null;
  lastUsedAt: null;
  expiresAt: null;
}

type AuthorizationRow = AuthorizedRow | ExpiredRow | RevokedRow;

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

function expiryFor(createdAt: Date, lastUsedAt: Date): Date {
  return new Date(
    Math.min(
      createdAt.getTime() + BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
      lastUsedAt.getTime() + BROWSER_SESSION_IDLE_TIMEOUT_MS,
    ),
  );
}

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * The authoritative browser-session boundary shared by BFF route handlers.
 *
 * Credential states are values; database failures are deliberately not. A caller may render
 * `absent` as a guest and reject invalid/expired credentials, while an unavailable store keeps
 * propagating as an infrastructure failure instead of silently becoming "signed out".
 */
export class BrowserSessionAuthority {
  private readonly clock: BrowserSessionClock;
  private readonly tokenSource: BrowserSessionTokenSource;

  constructor(
    private readonly db: ExtendedPrismaClient,
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
      try {
        const row = await this.db.browserSession.create({
          data: {
            cookieHash: hashBrowserSessionCookie(cookie),
            sub,
            createdAt: now,
            lastUsedAt: now,
          },
          select: { id: true, sub: true, createdAt: true, lastUsedAt: true },
        });
        return {
          cookie,
          sid: row.id,
          sub: row.sub,
          createdAt: row.createdAt,
          lastUsedAt: row.lastUsedAt,
          expiresAt: expiryFor(row.createdAt, row.lastUsedAt),
        };
      } catch (error) {
        if (!isUniqueConflict(error) || attempt === MAX_CREATE_ATTEMPTS) throw error;
      }
    }

    throw new Error('Browser session creation exhausted its collision retry budget.');
  }

  async authorize(cookie: string | undefined): Promise<BrowserSessionAuthorization> {
    if (cookie === undefined) return { kind: 'absent' };
    if (!COOKIE_PATTERN.test(cookie)) return { kind: 'invalid' };

    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');
    const cookieHash = hashBrowserSessionCookie(cookie);
    const rows = await this.db.$queryRaw<AuthorizationRow[]>(Prisma.sql`
      WITH matched AS MATERIALIZED (
        SELECT "sid", "revokedAt"
        FROM "BrowserSession"
        WHERE "cookieHash" = ${cookieHash}
        FOR UPDATE
      ), authorized AS (
        UPDATE "BrowserSession" AS target
        SET "lastUsedAt" = GREATEST(target."lastUsedAt", ${now})
        FROM matched
        WHERE target."sid" = matched."sid"
          AND target."revokedAt" IS NULL
          AND ${now} < target."lastUsedAt"
            + CAST(${BROWSER_SESSION_IDLE_TIMEOUT_MS} AS bigint) * INTERVAL '1 millisecond'
          AND ${now} < target."createdAt"
            + CAST(${BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS} AS bigint) * INTERVAL '1 millisecond'
        RETURNING
          target."sid",
          target."sub",
          target."createdAt",
          target."lastUsedAt",
          LEAST(
            target."lastUsedAt"
              + CAST(${BROWSER_SESSION_IDLE_TIMEOUT_MS} AS bigint) * INTERVAL '1 millisecond',
            target."createdAt"
              + CAST(${BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS} AS bigint) * INTERVAL '1 millisecond'
          ) AS "expiresAt"
      )
      SELECT
        'authenticated'::text AS outcome,
        "sid", "sub", "createdAt", "lastUsedAt", "expiresAt"
      FROM authorized
      UNION ALL
      SELECT
        CASE WHEN matched."revokedAt" IS NULL THEN 'expired' ELSE 'revoked' END AS outcome,
        NULL, NULL, NULL, NULL, NULL
      FROM matched
      WHERE NOT EXISTS (SELECT 1 FROM authorized)
    `);

    const row = rows[0];
    if (!row) return { kind: 'invalid' };
    if (row.outcome === 'expired') return { kind: 'expired' };
    if (row.outcome === 'revoked') return { kind: 'revoked' };
    return {
      kind: 'authenticated',
      session: {
        sid: row.sid,
        sub: row.sub,
        createdAt: row.createdAt,
        lastUsedAt: row.lastUsedAt,
        expiresAt: row.expiresAt,
      },
    };
  }

  async revoke(cookie: string | undefined): Promise<BrowserSessionRevocation> {
    if (cookie === undefined || !COOKIE_PATTERN.test(cookie)) return { revoked: false };
    const now = this.clock.now();
    assertValidDate(now, 'BrowserSessionClock.now()');
    const rows = await this.db.$queryRaw<Array<{ sid: string }>>(Prisma.sql`
      UPDATE "BrowserSession"
      SET "revokedAt" = GREATEST("createdAt", "lastUsedAt", ${now})
      WHERE "cookieHash" = ${hashBrowserSessionCookie(cookie)}
        AND "revokedAt" IS NULL
      RETURNING "sid"
    `);
    return { revoked: rows.length === 1 };
  }
}
