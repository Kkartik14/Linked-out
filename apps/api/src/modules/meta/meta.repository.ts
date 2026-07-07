import { Injectable } from '@nestjs/common';
import { Prisma } from '@linkedout/db';

import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MetaRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Most-used tags across public Ls, optionally filtered by a prefix. */
  async popularTags(
    prefix: string | undefined,
    limit: number,
  ): Promise<Array<{ tag: string; count: number }>> {
    const prefixClause = prefix ? Prisma.sql`AND tag ILIKE ${`${prefix}%`}` : Prisma.empty;
    const rows = await this.prisma.db.$queryRaw<Array<{ tag: string; count: bigint }>>`
      SELECT tag, COUNT(*) AS count
      FROM "L", unnest("tags") AS tag
      WHERE "visibility" = 'PUBLIC'
        ${prefixClause}
      GROUP BY tag
      ORDER BY count DESC, tag ASC
      LIMIT ${limit}
    `;
    return rows.map((row) => ({ tag: row.tag, count: Number(row.count) }));
  }
}
