import { Injectable } from '@nestjs/common';
import { Prisma, type LCategory } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';
import {
  USER_SUMMARY_SELECT,
  type UserSummarySource,
} from '../../common/mappers/user-summary.mapper';

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Full-text search over public Ls, ranked (title > lesson > story via the tsvector weights). */
  async searchLIds(
    q: string,
    category: LCategory | undefined,
    limit: number,
    offset: number,
  ): Promise<string[]> {
    const categoryClause = category
      ? Prisma.sql`AND "category" = ${category}::"LCategory"`
      : Prisma.empty;
    const rows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "L"
      WHERE "visibility" = 'PUBLIC'
        ${categoryClause}
        AND "searchVector" @@ websearch_to_tsquery('english', ${q})
      ORDER BY ts_rank("searchVector", websearch_to_tsquery('english', ${q})) DESC, "id" DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map((row) => row.id);
  }

  /** Simple user search by username/name prefix, hydrated to summaries in rank order. */
  async searchUsers(q: string, limit: number, offset: number): Promise<UserSummarySource[]> {
    const pattern = `%${q}%`;
    const idRows = await this.prisma.db.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "User"
      WHERE "username" ILIKE ${pattern} OR "name" ILIKE ${pattern}
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
