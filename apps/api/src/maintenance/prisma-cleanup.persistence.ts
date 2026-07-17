import { Prisma, type ExtendedPrismaClient } from '@linkedout/db';
import {
  BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
  BROWSER_SESSION_IDLE_TIMEOUT_MS,
  REVOKED_BROWSER_SESSION_RETENTION_MS,
} from '@linkedout/session-authority';

import { lockAvatarObjectKey } from '../common/avatar/avatar-object';
import type {
  AvatarClaimResult,
  AvatarIdentityAudit,
  CleanupPersistence,
  ExpiredEntity,
} from './cleanup.job';

const OWNED_AVATAR_FROM_URL_PATTERN =
  '^https?://[^/?#]+/[^?#]*(avatars/[^?#]+)([?#].*)?$';

/** PostgreSQL adapter for bounded retention deletes. Safe to run concurrently. */
export class PrismaCleanupPersistence implements CleanupPersistence {
  constructor(private readonly db: ExtendedPrismaClient) {}

  async deleteExpiredBatch(entity: ExpiredEntity, cutoff: Date, limit: number): Promise<number> {
    switch (entity) {
      case 'sessions':
        return this.db.$executeRaw`
          WITH doomed AS (
            SELECT "id"
            FROM "Session"
            WHERE "expires" <= ${cutoff}
            ORDER BY "expires", "id"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM "Session" AS target
          USING doomed
          WHERE target."id" = doomed."id"
        `;
      case 'browserSessions':
        return this.deleteExpiredBrowserSessionBatch(cutoff, limit);
      case 'verificationTokens':
        return this.db.$executeRaw`
          WITH doomed AS (
            SELECT "token"
            FROM "VerificationToken"
            WHERE "expires" <= ${cutoff}
            ORDER BY "expires", "token"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM "VerificationToken" AS target
          USING doomed
          WHERE target."token" = doomed."token"
        `;
      case 'rateLimitBuckets':
        return this.db.$executeRaw`
          WITH doomed AS (
            SELECT "key"
            FROM "RateLimitBucket"
            WHERE "resetAt" <= ${cutoff}
            ORDER BY "resetAt", "key"
            LIMIT ${limit}
            FOR UPDATE SKIP LOCKED
          )
          DELETE FROM "RateLimitBucket" AS target
          USING doomed
          WHERE target."key" = doomed."key"
        `;
    }
  }

  private async deleteExpiredBrowserSessionBatch(cutoff: Date, limit: number): Promise<number> {
    const revokedCutoff = new Date(cutoff.getTime() - REVOKED_BROWSER_SESSION_RETENTION_MS);
    const idleCutoff = new Date(cutoff.getTime() - BROWSER_SESSION_IDLE_TIMEOUT_MS);
    const absoluteCutoff = new Date(cutoff.getTime() - BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS);

    const revoked = await this.db.$executeRaw`
      WITH doomed AS (
        SELECT "sid"
        FROM "BrowserSession"
        WHERE "revokedAt" <= ${revokedCutoff}
        ORDER BY "revokedAt", "sid"
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "BrowserSession" AS target
      USING doomed
      WHERE target."sid" = doomed."sid"
    `;
    if (revoked === limit) return revoked;

    const afterRevoked = limit - revoked;
    const idleExpired = await this.db.$executeRaw`
      WITH doomed AS (
        SELECT "sid"
        FROM "BrowserSession"
        WHERE "revokedAt" IS NULL
          AND "lastUsedAt" <= ${idleCutoff}
        ORDER BY "lastUsedAt", "sid"
        LIMIT ${afterRevoked}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "BrowserSession" AS target
      USING doomed
      WHERE target."sid" = doomed."sid"
    `;
    if (revoked + idleExpired === limit) return limit;

    const afterIdle = limit - revoked - idleExpired;
    const absoluteExpired = await this.db.$executeRaw`
      WITH doomed AS (
        SELECT "sid"
        FROM "BrowserSession"
        WHERE "revokedAt" IS NULL
          AND "createdAt" <= ${absoluteCutoff}
        ORDER BY "createdAt", "sid"
        LIMIT ${afterIdle}
        FOR UPDATE SKIP LOCKED
      )
      DELETE FROM "BrowserSession" AS target
      USING doomed
      WHERE target."sid" = doomed."sid"
    `;
    return revoked + idleExpired + absoluteExpired;
  }

  async auditAvatarIdentity(sampleLimit: number): Promise<AvatarIdentityAudit> {
    const rows = await this.db.$queryRaw<Array<{ objectKey: string; total: bigint }>>(Prisma.sql`
      WITH parsed AS (
        SELECT
          "id",
          "avatarObjectKey",
          substring("image" FROM ${OWNED_AVATAR_FROM_URL_PATTERN}) AS object_key
        FROM "User"
        WHERE "image" IS NOT NULL
      ), drift AS (
        SELECT object_key
        FROM parsed
        WHERE object_key ~ '^avatars/[^/]+/[A-Za-z0-9][A-Za-z0-9._-]*$'
          AND split_part(object_key, '/', 2) = "id"
          AND "avatarObjectKey" IS DISTINCT FROM object_key
      )
      SELECT object_key AS "objectKey", COUNT(*) OVER() AS total
      FROM drift
      ORDER BY object_key
      LIMIT ${sampleLimit}
    `);
    const drifted = rows.length === 0 ? 0 : Number(rows[0]!.total);
    if (!Number.isSafeInteger(drifted)) {
      throw new Error('Avatar identity drift count exceeds the supported integer range.');
    }
    return {
      drifted,
      samples: rows.map(({ objectKey }) => objectKey),
      samplesTruncated: drifted > rows.length,
    };
  }

  async findReferencedAvatarKeys(keys: readonly string[]): Promise<ReadonlySet<string>> {
    if (keys.length === 0) return new Set();
    const users = await this.db.user.findMany({
      where: { avatarObjectKey: { in: [...keys] } },
      select: { avatarObjectKey: true },
    });
    return new Set(
      users.flatMap(({ avatarObjectKey }) =>
        avatarObjectKey === null ? [] : [avatarObjectKey],
      ),
    );
  }

  async claimUnreferencedAvatarKeys(keys: readonly string[]): Promise<AvatarClaimResult> {
    const uniqueKeys = [...new Set(keys)].sort();
    if (uniqueKeys.length === 0) return { referenced: new Set(), claimed: new Set() };

    return this.db.$transaction(async (tx) => {
      // A deterministic lock order makes overlapping cleanup jobs deadlock-free. Profile
      // updates take the identical lock before publishing an avatarObjectKey.
      for (const key of uniqueKeys) await lockAvatarObjectKey(tx, key);

      const users = await tx.user.findMany({
        where: { avatarObjectKey: { in: uniqueKeys } },
        select: { avatarObjectKey: true },
      });
      const referenced = new Set(
        users.flatMap(({ avatarObjectKey }) =>
          avatarObjectKey === null ? [] : [avatarObjectKey],
        ),
      );
      const claimable = uniqueKeys.filter((key) => !referenced.has(key));

      if (claimable.length > 0) {
        await tx.avatarDeletionClaim.createMany({
          data: claimable.map((key) => ({ key })),
          skipDuplicates: true,
        });
        // Existing failed claims and the practically-impossible reappearance of a
        // tombstoned key both re-enter the same retryable delete lifecycle.
        await tx.avatarDeletionClaim.updateMany({
          where: { key: { in: claimable } },
          data: { attempts: { increment: 1 }, deletedAt: null, lastError: null },
        });
      }

      return { referenced, claimed: new Set(claimable) };
    });
  }

  async markAvatarDeletionSucceeded(keys: readonly string[], deletedAt: Date): Promise<void> {
    if (keys.length === 0) return;
    await this.db.avatarDeletionClaim.updateMany({
      where: { key: { in: [...keys] } },
      data: { deletedAt, lastError: null },
    });
  }

  async markAvatarDeletionFailed(keys: readonly string[], error: string): Promise<void> {
    if (keys.length === 0) return;
    await this.db.avatarDeletionClaim.updateMany({
      where: { key: { in: [...keys] } },
      data: { lastError: error.slice(0, 1000) },
    });
  }
}
