import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';
import type { JourneyStatus } from '@linkedout/contracts/v2';

import { PrismaService } from '../../prisma/prisma.service';

export interface SuggestedUserCandidate {
  id: string;
  username: string;
  name: string | null;
  image: string | null;
  status: JourneyStatus | null;
  mutualCount: number;
  activityActorCount: number;
}

interface SuggestedUserCandidateRow {
  id: string;
  username: string;
  name: string | null;
  image: string | null;
  status: JourneyStatus | null;
  mutual_count: bigint;
  activity_actor_count: bigint;
}

export interface RankedLCandidate {
  id: string;
  interactionCount: number;
}

interface RankedLCandidateRow {
  id: string;
  interaction_count: bigint;
}

interface RankedLParams {
  startsAt: Date;
  endsAt: Date;
  attributedOnly: boolean;
  excludeLId?: string;
  limit: number;
}

function rankedLsQuery(params: RankedLParams): Prisma.Sql {
  const attribution = params.attributedOnly
    ? Prisma.sql`AND l."isAnonymous" = false AND author."username" IS NOT NULL`
    : Prisma.empty;
  const exclusion = params.excludeLId
    ? Prisma.sql`AND l."id" <> ${params.excludeLId}`
    : Prisma.empty;
  return Prisma.sql`
    WITH reaction_actors AS (
      SELECT DISTINCT reaction."lId" AS l_id, reaction."userId" AS actor_id
      FROM "Reaction" reaction
      JOIN "L" l ON l."id" = reaction."lId"
      WHERE reaction."createdAt" >= ${params.startsAt}
        AND reaction."createdAt" < ${params.endsAt}
        AND reaction."type" <> 'SAVED'
        AND reaction."userId" <> l."authorId"
    ),
    comment_actors AS (
      SELECT DISTINCT comment."lId" AS l_id, comment."authorId" AS actor_id
      FROM "Comment" comment
      JOIN "L" l ON l."id" = comment."lId"
      WHERE comment."createdAt" >= ${params.startsAt}
        AND comment."createdAt" < ${params.endsAt}
        AND comment."authorId" <> l."authorId"
    ),
    interaction_actors AS (
      SELECT l_id, actor_id FROM reaction_actors
      UNION
      SELECT l_id, actor_id FROM comment_actors
    ),
    interaction_counts AS (
      SELECT l_id, COUNT(*) AS interaction_count
      FROM interaction_actors
      GROUP BY l_id
    ),
    helpful_counts AS (
      SELECT reaction."lId" AS l_id, COUNT(DISTINCT reaction."userId") AS helpful_count
      FROM "Reaction" reaction
      JOIN "L" l ON l."id" = reaction."lId"
      WHERE reaction."createdAt" >= ${params.startsAt}
        AND reaction."createdAt" < ${params.endsAt}
        AND reaction."type" = 'HELPFUL'
        AND reaction."userId" <> l."authorId"
      GROUP BY reaction."lId"
    ),
    commenter_counts AS (
      SELECT comment."lId" AS l_id, COUNT(DISTINCT comment."authorId") AS commenter_count
      FROM "Comment" comment
      JOIN "L" l ON l."id" = comment."lId"
      WHERE comment."createdAt" >= ${params.startsAt}
        AND comment."createdAt" < ${params.endsAt}
        AND comment."authorId" <> l."authorId"
      GROUP BY comment."lId"
    )
    SELECT l."id", interaction_counts.interaction_count
    FROM interaction_counts
    JOIN "L" l ON l."id" = interaction_counts.l_id
    JOIN "User" author ON author."id" = l."authorId"
    LEFT JOIN helpful_counts ON helpful_counts.l_id = l."id"
    LEFT JOIN commenter_counts ON commenter_counts.l_id = l."id"
    WHERE l."visibility" = 'PUBLIC'
      ${attribution}
      ${exclusion}
    ORDER BY interaction_counts.interaction_count DESC,
             COALESCE(helpful_counts.helpful_count, 0) DESC,
             COALESCE(commenter_counts.commenter_count, 0) DESC,
             l."id" ASC
    LIMIT ${params.limit}
  `;
}

@Injectable()
export class FeedSidebarRepository {
  constructor(private readonly prisma: PrismaService) {}

  async suggestedUsers(params: {
    viewerId: string | undefined;
    activitySince: Date;
    limit: number;
  }): Promise<SuggestedUserCandidate[]> {
    const viewerId = params.viewerId ?? null;
    const rows = await this.prisma.db.$queryRaw<SuggestedUserCandidateRow[]>`
      WITH mutual_counts AS (
        SELECT second_edge."followingId" AS candidate_id,
               COUNT(DISTINCT first_edge."followingId") AS mutual_count
        FROM "Follow" first_edge
        JOIN "Follow" second_edge
          ON second_edge."followerId" = first_edge."followingId"
        WHERE ${viewerId}::text IS NOT NULL
          AND first_edge."followerId" = ${viewerId}
        GROUP BY second_edge."followingId"
      ),
      activity_actors AS (
        SELECT l."authorId" AS candidate_id, reaction."userId" AS actor_id
        FROM "Reaction" reaction
        JOIN "L" l ON l."id" = reaction."lId"
        WHERE reaction."createdAt" >= ${params.activitySince}
          AND reaction."type" <> 'SAVED'
          AND reaction."userId" <> l."authorId"
          AND l."visibility" = 'PUBLIC'
          AND l."isAnonymous" = false
        UNION
        SELECT l."authorId" AS candidate_id, comment."authorId" AS actor_id
        FROM "Comment" comment
        JOIN "L" l ON l."id" = comment."lId"
        WHERE comment."createdAt" >= ${params.activitySince}
          AND comment."authorId" <> l."authorId"
          AND l."visibility" = 'PUBLIC'
          AND l."isAnonymous" = false
      ),
      activity_counts AS (
        SELECT candidate_id, COUNT(*) AS activity_actor_count
        FROM activity_actors
        GROUP BY candidate_id
      )
      SELECT candidate."id",
             candidate."username",
             candidate."name",
             candidate."image",
             candidate."status",
             COALESCE(mutual_counts.mutual_count, 0) AS mutual_count,
             COALESCE(activity_counts.activity_actor_count, 0) AS activity_actor_count
      FROM "User" candidate
      LEFT JOIN mutual_counts ON mutual_counts.candidate_id = candidate."id"
      LEFT JOIN activity_counts ON activity_counts.candidate_id = candidate."id"
      WHERE candidate."username" IS NOT NULL
        AND (${viewerId}::text IS NULL OR candidate."id" <> ${viewerId})
        AND (
          ${viewerId}::text IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM "Follow" direct_edge
            WHERE direct_edge."followerId" = ${viewerId}
              AND direct_edge."followingId" = candidate."id"
          )
        )
        AND (
          COALESCE(mutual_counts.mutual_count, 0) > 0
          OR COALESCE(activity_counts.activity_actor_count, 0) > 0
        )
      ORDER BY COALESCE(mutual_counts.mutual_count, 0) DESC,
               COALESCE(activity_counts.activity_actor_count, 0) DESC,
               candidate."followerCount" DESC,
               candidate."id" ASC
      LIMIT ${params.limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      name: row.name,
      image: row.image,
      status: row.status,
      mutualCount: Number(row.mutual_count),
      activityActorCount: Number(row.activity_actor_count),
    }));
  }

  async rankedLs(params: RankedLParams): Promise<RankedLCandidate[]> {
    const rows = await this.prisma.db.$queryRaw<RankedLCandidateRow[]>(rankedLsQuery(params));
    return rows.map((row) => ({
      id: row.id,
      interactionCount: Number(row.interaction_count),
    }));
  }

  dailySelection(params: {
    selectedFor: Date;
    startsAt: Date;
    endsAt: Date;
  }): Promise<RankedLCandidate | null> {
    return this.prisma.db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        SELECT pg_advisory_xact_lock(hashtext(${params.selectedFor.toISOString()})) IS NULL AS locked
      `;

      const existing = await tx.dailyLSelection.findUnique({
        where: { selectedFor: params.selectedFor },
        select: {
          lId: true,
          interactionCount: true,
          l: {
            select: {
              visibility: true,
              isAnonymous: true,
              author: { select: { username: true } },
            },
          },
        },
      });
      if (existing?.lId === null && existing.interactionCount === 0) return null;
      if (
        existing?.lId &&
        existing.l?.visibility === 'PUBLIC' &&
        !existing.l.isAnonymous &&
        existing.l.author.username !== null
      ) {
        return { id: existing.lId, interactionCount: existing.interactionCount };
      }

      const [row] = await tx.$queryRaw<RankedLCandidateRow[]>(
        rankedLsQuery({
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          attributedOnly: true,
          limit: 1,
        }),
      );
      const candidate = row
        ? { id: row.id, interactionCount: Number(row.interaction_count) }
        : null;
      await tx.dailyLSelection.upsert({
        where: { selectedFor: params.selectedFor },
        create: {
          selectedFor: params.selectedFor,
          lId: candidate?.id ?? null,
          interactionCount: candidate?.interactionCount ?? 0,
        },
        update: {
          lId: candidate?.id ?? null,
          interactionCount: candidate?.interactionCount ?? 0,
          selectedAt: new Date(),
        },
      });
      return candidate;
    });
  }
}
