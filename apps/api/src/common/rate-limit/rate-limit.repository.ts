import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

export interface RateLimitBucketState {
  count: number;
  resetAt: number;
}

@Injectable()
export class RateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async hitBucket(key: string, windowMs: number, nowMs = Date.now()): Promise<RateLimitBucketState> {
    const now = new Date(nowMs);
    const nextReset = new Date(nowMs + windowMs);
    const rows = await this.prisma.db.$queryRaw<Array<{ count: number; resetAt: Date }>>`
      INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
      VALUES (${key}, 1, ${nextReset}, ${now})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN 1
          ELSE "RateLimitBucket"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimitBucket"."resetAt" <= ${now} THEN ${nextReset}
          ELSE "RateLimitBucket"."resetAt"
        END,
        "updatedAt" = ${now}
      RETURNING "count", "resetAt"
    `;
    const row = rows[0];
    return { count: row?.count ?? 1, resetAt: row?.resetAt.getTime() ?? nowMs + windowMs };
  }

  async cleanupExpired(cutoffMs: number): Promise<void> {
    await this.prisma.db.rateLimitBucket.deleteMany({
      where: { resetAt: { lte: new Date(cutoffMs) } },
    });
  }
}
