import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

export interface RateLimitReservationRequest {
  key: string;
  limit: number;
  permits: number;
  windowMs: number;
  nowMs: number;
}

export interface RateLimitReservation {
  granted: number;
  resetAt: number;
  exhausted: boolean;
}

@Injectable()
export class RateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Atomically reserves permits without letting the persisted count exceed the window limit. */
  async reservePermits(request: RateLimitReservationRequest): Promise<RateLimitReservation> {
    const { key, limit, permits, windowMs, nowMs } = request;
    const now = new Date(nowMs);
    const nextReset = new Date(nowMs + windowMs);

    // A concurrent first reservation can lose INSERT ... ON CONFLICT after its
    // statement snapshot saw no row. Retrying gets a fresh snapshot; all normal
    // existing-bucket refills remain one statement.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const rows = await this.prisma.db.$queryRaw<
        Array<{ granted: number; resetAt: Date; exhausted: boolean }>
      >`
        WITH "currentBucket" AS MATERIALIZED (
          SELECT "count", "resetAt"
          FROM "RateLimitBucket"
          WHERE "key" = ${key}
          FOR UPDATE
        ),
        "updatedBucket" AS (
          UPDATE "RateLimitBucket" AS "bucket"
          SET
            "count" = CASE
              WHEN "currentBucket"."resetAt" <= ${now}
                THEN LEAST(${permits}::integer, ${limit}::integer)
              ELSE "currentBucket"."count" + LEAST(
                ${permits}::integer,
                GREATEST(${limit}::integer - "currentBucket"."count", 0)
              )
            END,
            "resetAt" = CASE
              WHEN "currentBucket"."resetAt" <= ${now} THEN ${nextReset}
              ELSE "currentBucket"."resetAt"
            END,
            "updatedAt" = ${now}
          FROM "currentBucket"
          WHERE "bucket"."key" = ${key}
          RETURNING
            CASE
              WHEN "currentBucket"."resetAt" <= ${now}
                THEN LEAST(${permits}::integer, ${limit}::integer)
              ELSE LEAST(
                ${permits}::integer,
                GREATEST(${limit}::integer - "currentBucket"."count", 0)
              )
            END AS "granted",
            "bucket"."resetAt" AS "resetAt",
            "bucket"."count" >= ${limit}::integer AS "exhausted"
        ),
        "insertedBucket" AS (
          INSERT INTO "RateLimitBucket" ("key", "count", "resetAt", "updatedAt")
          SELECT
            ${key},
            LEAST(${permits}::integer, ${limit}::integer),
            ${nextReset},
            ${now}
          WHERE NOT EXISTS (SELECT 1 FROM "currentBucket")
          ON CONFLICT ("key") DO NOTHING
          RETURNING
            LEAST(${permits}::integer, ${limit}::integer) AS "granted",
            "resetAt",
            "count" >= ${limit}::integer AS "exhausted"
        )
        SELECT "granted", "resetAt", "exhausted" FROM "updatedBucket"
        UNION ALL
        SELECT "granted", "resetAt", "exhausted" FROM "insertedBucket"
      `;
      const reservation = rows[0];
      if (reservation) {
        return {
          granted: reservation.granted,
          resetAt: reservation.resetAt.getTime(),
          exhausted: reservation.exhausted,
        };
      }
    }

    throw new Error('Rate-limit permit reservation could not acquire its bucket.');
  }
}
