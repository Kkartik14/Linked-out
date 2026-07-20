import { Prisma, type ExtendedPrismaClient } from '@linkedout/db';

import type {
  AuthorizeBrowserSessionInput,
  BrowserSessionPersistence,
  BrowserSessionRevocation,
  CreateBrowserSessionInput,
  CreateBrowserSessionResult,
  ExchangeOAuthHandoffInput,
  ExchangeOAuthHandoffResult,
  PersistedBrowserSessionAuthorization,
  RevokeBrowserSessionInput,
} from './browser-session.types';

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

function isUniqueConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** Prisma/PostgreSQL adapter for the browser-session persistence seam. */
export class PrismaBrowserSessionPersistence implements BrowserSessionPersistence {
  constructor(private readonly db: ExtendedPrismaClient) {}

  async create(input: CreateBrowserSessionInput): Promise<CreateBrowserSessionResult> {
    try {
      const row = await this.db.browserSession.create({
        data: {
          cookieHash: input.cookieHash,
          sub: input.sub,
          createdAt: input.now,
          lastUsedAt: input.now,
        },
        select: { id: true, sub: true, createdAt: true, lastUsedAt: true },
      });
      return {
        kind: 'created',
        session: { sid: row.id, sub: row.sub, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt },
      };
    } catch (error) {
      if (isUniqueConflict(error)) return { kind: 'cookie-hash-conflict' };
      throw error;
    }
  }

  async exchangeOAuthHandoff(
    input: ExchangeOAuthHandoffInput,
  ): Promise<ExchangeOAuthHandoffResult> {
    try {
      return await this.db.$transaction(async (tx) => {
        const handoffs = await tx.$queryRaw<Array<{ sub: string; returnTo: string }>>(Prisma.sql`
          UPDATE "OAuthHandoff"
          SET "consumedAt" = CURRENT_TIMESTAMP
          WHERE "codeHash" = ${input.codeHash}
            AND "consumedAt" IS NULL
            AND CURRENT_TIMESTAMP < "expiresAt"
          RETURNING "sub", "returnTo"
        `);
        const handoff = handoffs[0];
        if (!handoff) return { kind: 'invalid-handoff' };

        const row = await tx.browserSession.create({
          data: {
            cookieHash: input.cookieHash,
            sub: handoff.sub,
            createdAt: input.now,
            lastUsedAt: input.now,
          },
          select: { id: true, sub: true, createdAt: true, lastUsedAt: true },
        });
        return {
          kind: 'exchanged',
          session: {
            sid: row.id,
            sub: row.sub,
            createdAt: row.createdAt,
            lastUsedAt: row.lastUsedAt,
          },
          returnTo: handoff.returnTo,
        };
      });
    } catch (error) {
      if (isUniqueConflict(error)) return { kind: 'cookie-hash-conflict' };
      throw error;
    }
  }

  async authorize(
    input: AuthorizeBrowserSessionInput,
  ): Promise<PersistedBrowserSessionAuthorization> {
    const rows = await this.db.$queryRaw<AuthorizationRow[]>(Prisma.sql`
      WITH matched AS MATERIALIZED (
        SELECT "sid", "revokedAt"
        FROM "BrowserSession"
        WHERE "cookieHash" = ${input.cookieHash}
        FOR UPDATE
      ), authorized AS (
        UPDATE "BrowserSession" AS target
        SET "lastUsedAt" = GREATEST(target."lastUsedAt", ${input.now})
        FROM matched
        WHERE target."sid" = matched."sid"
          AND target."revokedAt" IS NULL
          AND ${input.now} < target."lastUsedAt"
            + CAST(${input.idleTimeoutMs} AS bigint) * INTERVAL '1 millisecond'
          AND ${input.now} < target."createdAt"
            + CAST(${input.absoluteTimeoutMs} AS bigint) * INTERVAL '1 millisecond'
        RETURNING
          target."sid",
          target."sub",
          target."createdAt",
          target."lastUsedAt",
          LEAST(
            target."lastUsedAt"
              + CAST(${input.idleTimeoutMs} AS bigint) * INTERVAL '1 millisecond',
            target."createdAt"
              + CAST(${input.absoluteTimeoutMs} AS bigint) * INTERVAL '1 millisecond'
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

  async revoke(input: RevokeBrowserSessionInput): Promise<BrowserSessionRevocation> {
    const rows = await this.db.$queryRaw<Array<{ sid: string }>>(Prisma.sql`
      UPDATE "BrowserSession"
      SET "revokedAt" = GREATEST("createdAt", "lastUsedAt", ${input.now})
      WHERE "cookieHash" = ${input.cookieHash}
        AND "revokedAt" IS NULL
      RETURNING "sid"
    `);
    return { revoked: rows.length === 1 };
  }
}
