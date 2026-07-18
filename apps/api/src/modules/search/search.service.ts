import { Injectable } from '@nestjs/common';
import {
  type LCard,
  type Paginated,
  type SearchQuery,
  type UserSummary,
} from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor, encodeCursor } from '../../common/pagination/cursor';
import {
  groupViewerReactions,
  mapLRows,
  type LWithAuthor,
} from '../../common/read-models/l-read-model';
import { toLCard } from '../ls/ls.mapper';
import { SearchRepository } from './search.repository';
import type { SearchLCursor, SearchUserCursor } from './search.repository';

export type SearchResult = Paginated<LCard> | Paginated<UserSummary>;

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
  constructor(private readonly repo: SearchRepository) {}

  async search(query: SearchQuery, viewerId: string | undefined): Promise<SearchResult> {
    if (query.type === 'users') {
      return this.searchUsers(query, readUserCursor(query.cursor));
    }
    return this.searchLs(query, viewerId);
  }

  private async searchLs(
    query: SearchQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<LCard>> {
    const rows = await this.repo.searchLRows(
      query.q,
      viewerId,
      query.limit + 1,
      readRankCursor(query.cursor),
    );
    const hasMore = rows.length > query.limit;
    const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
    const pageIds = pageRows.map((row) => row.id);
    const data = await this.cards(pageIds, viewerId, toLCard);
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

  private async cards<T>(
    ids: string[],
    viewerId: string | undefined,
    mapper: Parameters<typeof mapLRows<T>>[3],
  ): Promise<T[]> {
    const rows = await this.repo.visibleLsByIds(ids, viewerId);
    return mapLRows(rows, viewerId, await this.reactionMap(viewerId, rows), mapper);
  }

  private async reactionMap(viewerId: string | undefined, rows: LWithAuthor[]) {
    if (!viewerId || rows.length === 0) return new Map();
    return groupViewerReactions(
      await this.repo.viewerReactions(
        viewerId,
        rows.map((row) => row.id),
      ),
    );
  }
}
