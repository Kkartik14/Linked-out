import { Injectable } from '@nestjs/common';
import {
  FEED_FILTER_TO_CATEGORY,
  type LCard,
  type Paginated,
  type SearchQuery,
  type UserSummary,
} from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { LsService } from '../ls/ls.service';
import { SearchRepository } from './search.repository';
import type { SearchLCursor } from './search.repository';

export type SearchResult = Paginated<LCard> | Paginated<UserSummary>;

function readOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const value = decodeCursor(cursor).offset;
  if (typeof value !== 'number' || value < 0) throw AppErrors.badCursor();
  return value;
}

function readRankCursor(cursor: string | undefined): SearchLCursor | null {
  if (cursor === undefined) return null;
  const payload = decodeCursor(cursor);
  if (typeof payload.rank !== 'number' || typeof payload.id !== 'string') {
    throw AppErrors.badCursor();
  }
  return { rank: payload.rank, id: payload.id };
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly ls: LsService,
  ) {}

  async search(query: SearchQuery, viewerId: string | undefined): Promise<SearchResult> {
    if (query.type === 'users') {
      const offset = readOffset(query.cursor);
      return this.searchUsers(query, offset);
    }
    return this.searchLs(query, viewerId);
  }

  private async searchLs(
    query: SearchQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<LCard>> {
    const category = query.filter ? FEED_FILTER_TO_CATEGORY[query.filter] : undefined;
    const rows = await this.repo.searchLRows(
      query.q,
      category,
      viewerId,
      query.limit + 1,
      readRankCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const pageIds = pageRows.map((row) => row.id);
    const data = await this.ls.getVisibleCardsByIds(pageIds, viewerId);
    const last = pageRows[pageRows.length - 1];
    return {
      data,
      nextCursor: hasMore && last ? encodeCursor({ rank: last.rank, id: last.id }) : null,
    };
  }

  private async searchUsers(query: SearchQuery, offset: number): Promise<Paginated<UserSummary>> {
    const rows = await this.repo.searchUsers(query.q, query.limit + 1, offset);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      data: pageRows.map(toUserSummary),
      nextCursor: hasMore ? encodeCursor({ offset: offset + query.limit }) : null,
    };
  }
}
