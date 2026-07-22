import { Injectable } from '@nestjs/common';
import { Prisma, type JourneyStatus, type ReactionType } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

const AUTHOR_INCLUDE = {
  author: { select: { id: true, username: true, name: true, image: true, status: true } },
} satisfies Prisma.LInclude;

const PROFILE_SELECT = {
  id: true,
  username: true,
  name: true,
  image: true,
  bio: true,
  status: true,
  storiesShared: true,
  lsShared: true,
  followerCount: true,
  followingCount: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

type SidebarL = Prisma.LGetPayload<{ include: typeof AUTHOR_INCLUDE }>;
type SidebarViewerProfile = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

const DAILY_SELECTION_SELECT = {
  lId: true,
  interactionCount: true,
  selectedAt: true,
  l: {
    select: {
      visibility: true,
      isAnonymous: true,
      author: { select: { username: true } },
    },
  },
} satisfies Prisma.DailyLSelectionSelect;

type DailySelectionRow = Prisma.DailyLSelectionGetPayload<{
  select: typeof DAILY_SELECTION_SELECT;
}>;

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

export interface DailySelectionSnapshot {
  lId: string | null;
  interactionCount: number;
  selectedAt: Date;
  l: {
    visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
    isAnonymous: boolean;
    author: { username: string | null };
  } | null;
}

export interface SidebarLRow {
  l: SidebarL;
  viewerReactions: ReactionType[];
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
    ? Prisma.sql`AND l."isAnonymous" = false AND NULLIF(BTRIM(author."username"), '') IS NOT NULL`
    : Prisma.empty;
  const exclusion = params.excludeLId
    ? Prisma.sql`AND l."id" <> ${params.excludeLId}`
    : Prisma.empty;
  return Prisma.sql`
    WITH interaction_events AS (
      SELECT reaction."lId" AS l_id,
             reaction."userId" AS actor_id,
             reaction."type" = 'HELPFUL' AS was_helpful,
             false AS was_comment
      FROM "Reaction" reaction
      JOIN "L" l ON l."id" = reaction."lId"
      WHERE reaction."createdAt" >= ${params.startsAt}
        AND reaction."createdAt" < ${params.endsAt}
        AND reaction."type" <> 'SAVED'
        AND reaction."userId" <> l."authorId"
      UNION ALL
      SELECT comment."lId" AS l_id,
             comment."authorId" AS actor_id,
             false AS was_helpful,
             true AS was_comment
      FROM "Comment" comment
      JOIN "L" l ON l."id" = comment."lId"
      WHERE comment."createdAt" >= ${params.startsAt}
        AND comment."createdAt" < ${params.endsAt}
        AND comment."authorId" <> l."authorId"
    ),
    actor_rollups AS (
      SELECT l_id,
             actor_id,
             BOOL_OR(was_helpful) AS was_helpful,
             BOOL_OR(was_comment) AS was_comment
      FROM interaction_events
      GROUP BY l_id, actor_id
    ),
    interaction_counts AS (
      SELECT l_id,
             COUNT(*) AS interaction_count,
             COUNT(*) FILTER (WHERE was_helpful) AS helpful_count,
             COUNT(*) FILTER (WHERE was_comment) AS commenter_count
      FROM actor_rollups
      GROUP BY l_id
    )
    SELECT l."id", interaction_counts.interaction_count
    FROM interaction_counts
    JOIN "L" l ON l."id" = interaction_counts.l_id
    JOIN "User" author ON author."id" = l."authorId"
    WHERE l."visibility" = 'PUBLIC'
      ${attribution}
      ${exclusion}
    ORDER BY interaction_counts.interaction_count DESC,
             interaction_counts.helpful_count DESC,
             interaction_counts.commenter_count DESC,
             l."id" ASC
    LIMIT ${params.limit}
  `;
}

function toDailySnapshot(row: DailySelectionRow): DailySelectionSnapshot {
  return {
    lId: row.lId,
    interactionCount: row.interactionCount,
    selectedAt: row.selectedAt,
    l: row.l,
  };
}

function sameRevision(actual: Date | undefined, expected: Date | null): boolean {
  return expected === null ? actual === undefined : actual?.getTime() === expected.getTime();
}

@Injectable()
export class FeedSidebarRepository {
  constructor(private readonly prisma: PrismaService) {}

  viewerProfile(userId: string): Promise<SidebarViewerProfile | null> {
    return this.prisma.db.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  }

  async publicLs(ids: string[], viewerId: string | undefined): Promise<SidebarLRow[]> {
    if (ids.length === 0) return [];
    const [ls, reactions] = await Promise.all([
      this.prisma.db.l.findMany({
        where: { id: { in: ids }, visibility: 'PUBLIC' },
        include: AUTHOR_INCLUDE,
      }),
      viewerId
        ? this.prisma.db.reaction.findMany({
            where: { userId: viewerId, lId: { in: ids } },
            select: { lId: true, type: true },
          })
        : Promise.resolve([]),
    ]);
    const lById = new Map(ls.map((l) => [l.id, l]));
    const reactionsByLId = new Map<string, ReactionType[]>();
    for (const reaction of reactions) {
      const current = reactionsByLId.get(reaction.lId);
      if (current) current.push(reaction.type);
      else reactionsByLId.set(reaction.lId, [reaction.type]);
    }
    return ids.flatMap((id) => {
      const l = lById.get(id);
      return l ? [{ l, viewerReactions: reactionsByLId.get(id) ?? [] }] : [];
    });
  }

  async suggestedUsers(params: {
    viewerId: string | undefined;
    activityStartsAt: Date;
    activityEndsAt: Date;
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
        WHERE reaction."createdAt" >= ${params.activityStartsAt}
          AND reaction."createdAt" < ${params.activityEndsAt}
          AND reaction."type" <> 'SAVED'
          AND reaction."userId" <> l."authorId"
          AND l."visibility" = 'PUBLIC'
          AND l."isAnonymous" = false
        UNION
        SELECT l."authorId" AS candidate_id, comment."authorId" AS actor_id
        FROM "Comment" comment
        JOIN "L" l ON l."id" = comment."lId"
        WHERE comment."createdAt" >= ${params.activityStartsAt}
          AND comment."createdAt" < ${params.activityEndsAt}
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
      WHERE NULLIF(BTRIM(candidate."username"), '') IS NOT NULL
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

  async dailySelection(selectedFor: Date): Promise<DailySelectionSnapshot | null> {
    const row = await this.prisma.db.dailyLSelection.findUnique({
      where: { selectedFor },
      select: DAILY_SELECTION_SELECT,
    });
    return row ? toDailySnapshot(row) : null;
  }

  storeDailySelection(params: {
    selectedFor: Date;
    expectedSelectedAt: Date | null;
    candidate: RankedLCandidate | null;
  }): Promise<{ stored: boolean; snapshot: DailySelectionSnapshot | null }> {
    return this.prisma.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${params.selectedFor.toISOString()}))`;
      const current = await tx.dailyLSelection.findUnique({
        where: { selectedFor: params.selectedFor },
        select: DAILY_SELECTION_SELECT,
      });
      if (!sameRevision(current?.selectedAt, params.expectedSelectedAt)) {
        return { stored: false, snapshot: current ? toDailySnapshot(current) : null };
      }

      const selectedAt = new Date();
      const stored = await tx.dailyLSelection.upsert({
        where: { selectedFor: params.selectedFor },
        create: {
          selectedFor: params.selectedFor,
          lId: params.candidate?.id ?? null,
          interactionCount: params.candidate?.interactionCount ?? 0,
          selectedAt,
        },
        update: {
          lId: params.candidate?.id ?? null,
          interactionCount: params.candidate?.interactionCount ?? 0,
          selectedAt,
        },
        select: DAILY_SELECTION_SELECT,
      });
      return { stored: true, snapshot: toDailySnapshot(stored) };
    });
  }
}
