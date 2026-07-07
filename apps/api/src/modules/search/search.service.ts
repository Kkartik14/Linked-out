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

export type SearchResult = Paginated<LCard> | Paginated<UserSummary>;

function readOffset(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const value = decodeCursor(cursor).offset;
  if (typeof value !== 'number' || value < 0) throw AppErrors.badCursor();
  return value;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly ls: LsService,
  ) {}

  async search(query: SearchQuery, viewerId: string | undefined): Promise<SearchResult> {
    const offset = readOffset(query.cursor);
    if (query.type === 'users') {
      return this.searchUsers(query, offset);
    }
    return this.searchLs(query, offset, viewerId);
  }

  private async searchLs(
    query: SearchQuery,
    offset: number,
    viewerId: string | undefined,
  ): Promise<Paginated<LCard>> {
    const category = query.filter ? FEED_FILTER_TO_CATEGORY[query.filter] : undefined;
    const ids = await this.repo.searchLIds(query.q, category, query.limit + 1, offset);
    const hasMore = ids.length > query.limit;
    const pageIds = hasMore ? ids.slice(0, query.limit) : ids;
    const data = await this.ls.getCardsByIds(pageIds, viewerId);
    return { data, nextCursor: hasMore ? encodeCursor({ offset: offset + query.limit }) : null };
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
