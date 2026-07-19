import { Injectable } from '@nestjs/common';
import { Prisma, type ReactionType } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import type { UserSummarySource } from '../../common/mappers/user-summary.mapper';
import {
  L_AUTHOR_INCLUDE,
  type LWithAuthor,
} from '../../common/read-models/l-read-model';

export interface SearchLRow {
  id: string;
  rank: number;
}

export interface SearchLCursor {
  rank: number;
  id: string;
}

export interface SearchUserCursor {
  username: string;
  id: string;
}

export interface SearchUserRow extends UserSummarySource {
  username: string;
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Full-text search over visible Ls, ranked title > story via tsvector weights. */
  async searchLRows(
    q: string,
    viewerId: string | undefined,
    limit: number,
    cursor: SearchLCursor | null,
  ): Promise<SearchLRow[]> {
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

  /**
   * Case-insensitive substring search with a stable username/id keyset. The expression
   * deliberately matches `User_search_trgm_idx` from the raw migration, so the leading
   * wildcard uses PostgreSQL trigram lookup instead of scanning every user.
   */
  searchUsers(q: string, limit: number, cursor: SearchUserCursor | null): Promise<SearchUserRow[]> {
    const pattern = `%${escapeLikePattern(q)}%`;
    const cursorClause = cursor
      ? Prisma.sql`AND ("username", "id") > (${cursor.username}, ${cursor.id})`
      : Prisma.empty;
    return this.prisma.db.$queryRaw<SearchUserRow[]>`
      SELECT "id", "username", "name", "image", "status"
      FROM "User"
      WHERE "username" IS NOT NULL
        AND ("username" || ' ' || COALESCE("name", '')) ILIKE ${pattern} ESCAPE '\\'
        ${cursorClause}
      ORDER BY "username" ASC, "id" ASC
      LIMIT ${limit}
    `;
  }

  /** Rechecks privacy in SQL before hydrating raw full-text result ids. */
  async visibleLsByIds(ids: string[], viewerId: string | undefined): Promise<LWithAuthor[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.db.l.findMany({
      where: {
        id: { in: ids },
        OR: [
          { visibility: 'PUBLIC' },
          ...(viewerId
            ? [
                { authorId: viewerId },
                {
                  visibility: 'FOLLOWERS' as const,
                  author: { followers: { some: { followerId: viewerId } } },
                },
              ]
            : []),
        ],
      },
      include: L_AUTHOR_INCLUDE,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  viewerReactions(
    viewerId: string,
    lIds: string[],
  ): Promise<Array<{ lId: string; type: ReactionType }>> {
    if (lIds.length === 0) return Promise.resolve([]);
    return this.prisma.db.reaction.findMany({
      where: { userId: viewerId, lId: { in: lIds } },
      select: { lId: true, type: true },
    });
  }
}
