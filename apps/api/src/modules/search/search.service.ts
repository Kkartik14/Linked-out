import { Injectable } from '@nestjs/common';
import {
  FEED_FILTER_TO_CATEGORY,
  type LCard,
  type Paginated,
  type SearchQuery,
  type UserSummary,
} from '@linkedout/contracts';
import type {
  LCard as LCardV2,
  SearchQuery as SearchQueryV2,
  UserSummary as UserSummaryV2,
} from '@linkedout/contracts/v2';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import { LsService } from '../ls/ls.service';
import { SearchRepository } from './search.repository';
import type { SearchLCursor, SearchUserCursor } from './search.repository';

export type SearchResult = Paginated<LCard> | Paginated<UserSummary>;
export type SearchResultV2 = Paginated<LCardV2> | Paginated<UserSummaryV2>;

function readRankCursor(cursor: string | undefined): SearchLCursor | null {
  if (cursor === undefined) return null;
  const payload = decodeCursor(cursor);
  if (typeof payload.rank !== 'number' || typeof payload.id !== 'string') {
    throw AppErrors.badCursor();
  }
  return { rank: payload.rank, id: payload.id };
}

function readUserCursor(cursor: string | undefined): SearchUserCursor | null {
  if (cursor === undefined) return null;
  const payload = decodeCursor(cursor);
  if (
    typeof payload.username !== 'string' ||
    payload.username.length === 0 ||
    typeof payload.id !== 'string' ||
    payload.id.length === 0
  ) {
    throw AppErrors.badCursor();
  }
  return { username: payload.username, id: payload.id };
}

@Injectable()
export class SearchService {
  constructor(
    private readonly repo: SearchRepository,
    private readonly ls: LsService,
  ) {}

  async search(query: SearchQuery, viewerId: string | undefined): Promise<SearchResult> {
    if (query.type === 'users') {
      return this.searchUsers(query, readUserCursor(query.cursor));
    }
    return this.searchLs(query, viewerId);
  }

  async searchV2(query: SearchQueryV2, viewerId: string | undefined): Promise<SearchResultV2> {
    if (query.type === 'users') {
      return this.searchUsers(query, readUserCursor(query.cursor));
    }
    return this.searchLsV2(query, viewerId);
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

  private async searchLsV2(
    query: SearchQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<LCardV2>> {
    const rows = await this.repo.searchLRows(
      query.q,
      undefined,
      viewerId,
      query.limit + 1,
      readRankCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const data = await this.ls.getVisibleCardsByIdsV2(
      pageRows.map((row) => row.id),
      viewerId,
    );
    const last = pageRows[pageRows.length - 1];
    return {
      data,
      nextCursor: hasMore && last ? encodeCursor({ rank: last.rank, id: last.id }) : null,
    };
  }

  private async searchUsers(
    query: SearchQuery,
    cursor: SearchUserCursor | null,
  ): Promise<Paginated<UserSummary>> {
    const rows = await this.repo.searchUsers(query.q, query.limit + 1, cursor);
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const last = pageRows[pageRows.length - 1];
    return {
      data: pageRows.map(toUserSummary),
      nextCursor: hasMore && last ? encodeCursor({ username: last.username, id: last.id }) : null,
    };
  }
}
