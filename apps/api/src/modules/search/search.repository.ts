import { Injectable } from '@nestjs/common';
import { Prisma, type LCategory } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import {
  USER_SUMMARY_SELECT,
  type UserSummarySource,
} from '../../common/mappers/user-summary.mapper';

export interface SearchLRow {
  id: string;
  rank: number;
}

export interface SearchLCursor {
  rank: number;
  id: string;
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Full-text search over visible Ls, ranked (title > lesson > story via tsvector weights). */
  async searchLRows(
    q: string,
    category: LCategory | undefined,
    viewerId: string | undefined,
    limit: number,
    cursor: SearchLCursor | null,
  ): Promise<SearchLRow[]> {
    const categoryClause = category
      ? Prisma.sql`AND "category" = ${category}::"LCategory"`
      : Prisma.empty;
    const viewer = viewerId ? Prisma.sql`${viewerId}` : Prisma.sql`NULL`;
    const cursorClause = cursor
      ? Prisma.sql`WHERE (rank_score, "id") < (${cursor.rank}, ${cursor.id})`
      : Prisma.empty;
    const rows = await this.prisma.db.$queryRaw<Array<{ id: string; rank_score: number }>>`
      WITH query AS (
        SELECT websearch_to_tsquery('english', ${q}) AS value
      ),
      ranked AS (
        SELECT "id", ts_rank("searchVector", query.value)::double precision AS rank_score
        FROM "L", query
        WHERE "searchVector" @@ query.value
          ${categoryClause}
          AND (
            "visibility" = 'PUBLIC'
            OR (${viewer} IS NOT NULL AND "authorId" = ${viewer})
            OR (
              ${viewer} IS NOT NULL
              AND "visibility" = 'FOLLOWERS'
              AND EXISTS (
                SELECT 1 FROM "Follow"
                WHERE "followerId" = ${viewer}
                  AND "followingId" = "L"."authorId"
              )
            )
          )
      )
      SELECT "id", rank_score
      FROM ranked
      ${cursorClause}
      ORDER BY rank_score DESC, "id" DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ id: row.id, rank: row.rank_score }));
  }

  /** Simple user search by username/name prefix, hydrated to summaries in rank order. */
  async searchUsers(q: string, limit: number, offset: number): Promise<UserSummarySource[]> {
    const pattern = `%${q}%`;
    const idRows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "username" IS NOT NULL
        AND ("username" ILIKE ${pattern} OR "name" ILIKE ${pattern})
      ORDER BY "username" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const ids = idRows.map((row) => row.id);
    if (ids.length === 0) return [];
    const users = await this.prisma.db.user.findMany({
      where: { id: { in: ids } },
      select: USER_SUMMARY_SELECT,
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    const ordered: UserSummarySource[] = [];
    for (const id of ids) {
      const user = byId.get(id);
      if (user) ordered.push(user);
    }
    return ordered;
  }
}
