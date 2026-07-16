import { Injectable } from '@nestjs/common';
import {
  FEED_FILTER_TO_CATEGORY,
  lTypeSchema,
  type CreateLInput,
  type FeedQuery,
  type JourneyNode,
  type JourneyQuery,
  type LCard,
  type LDetail,
  type LType,
  type Paginated,
  type PaginationQuery,
  type ReactionType,
  type UpdateLInput,
  type UserLsQuery,
  type Visibility,
} from '@linkedout/contracts';
import type {
  CreateLInput as CreateLInputV2,
  FeedQuery as FeedQueryV2,
  JourneyNode as JourneyNodeV2,
  JourneyQuery as JourneyQueryV2,
  LCard as LCardV2,
  LDetail as LDetailV2,
  UpdateLInput as UpdateLInputV2,
  UserLsQuery as UserLsQueryV2,
} from '@linkedout/contracts/v2';

import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursor } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import {
  LsRepository,
  type LWithAuthor,
} from './ls.repository';
import type {
  FeedPageCursor,
  CreatedAtJourneyPageCursor,
  JourneyPageCursor,
  LUpdatePlans,
  UpdateLData,
  WriteLData,
} from './ls.types';
import {
  planLDelete,
  reputationDeltaForTypeChange,
  reputationForType,
} from './ls.write-plan';
import { toJourneyNode, toLCard, toLDetail } from './ls.mapper';
import { toV2JourneyNode, toV2LCard, toV2LDetail } from './ls-v2.mapper';

const ALL_VISIBILITIES: Visibility[] = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'];

function normalizeCreate(input: CreateLInput): WriteLData {
  return {
    title: input.title,
    story: input.story,
    type: input.type,
    category: input.category ?? null,
    company: input.company ?? null,
    tags: input.tags,
    eventDate: input.eventDate ?? null,
    visibility: input.visibility,
    isAnonymous: input.isAnonymous,
  };
}

function normalizeCreateV2(input: CreateLInputV2): WriteLData {
  return {
    title: input.title,
    story: input.story,
    type: input.type,
    category: null,
    company: null,
    tags: [],
    eventDate: null,
    visibility: input.visibility,
    isAnonymous: input.isAnonymous,
  };
}

function buildUpdateData(input: UpdateLInput, effectiveType: LType): UpdateLData {
  return {
    title: input.title,
    story: input.story,
    type: input.type,
    category: input.category,
    company: input.company,
    tags: input.tags,
    eventDate: input.eventDate,
    visibility: input.visibility,
    isAnonymous: input.isAnonymous,
    resolvedAt:
      effectiveType === 'BATTLE'
        ? input.resolvedAt
        : input.type !== undefined || input.resolvedAt !== undefined
          ? null
          : undefined,
  };
}

function buildUpdateDataV2(input: UpdateLInputV2, effectiveType: LType): UpdateLData {
  return {
    title: input.title,
    story: input.story,
    type: input.type,
    category: undefined,
    company: undefined,
    tags: undefined,
    eventDate: undefined,
    visibility: input.visibility,
    isAnonymous: input.isAnonymous,
    resolvedAt:
      effectiveType === 'BATTLE'
        ? input.resolvedAt
        : input.type !== undefined || input.resolvedAt !== undefined
          ? null
          : undefined,
  };
}

function cursorString(value: string | number | undefined): string {
  if (typeof value !== 'string' || value.length === 0) throw AppErrors.badCursor();
  return value;
}

function feedCursor(sort: FeedQuery['sort'], cursor: string | undefined): FeedPageCursor | undefined {
  if (cursor === undefined) return undefined;
  const payload = decodeCursor(cursor);
  const id = cursorString(payload.id);
  if (sort === 'popular') {
    if (typeof payload.score !== 'number' || !Number.isFinite(payload.score)) {
      throw AppErrors.badCursor();
    }
    return { sort, id, score: payload.score };
  }
  if (sort === 'helpful') {
    if (!Number.isSafeInteger(payload.count) || (payload.count as number) < 0) {
      throw AppErrors.badCursor();
    }
    return { sort, id, count: payload.count as number };
  }
  return { sort, id };
}

function cursorField(cursor: string | undefined, field: string): string | undefined {
  if (cursor === undefined) return undefined;
  return cursorString(decodeCursor(cursor)[field]);
}

function journeyCursor(cursor: string | undefined): JourneyPageCursor | undefined {
  if (cursor === undefined) return undefined;
  const payload = decodeCursor(cursor);
  const date = cursorString(payload.date);
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== date) {
    throw AppErrors.badCursor();
  }
  return { date, id: cursorString(payload.id) };
}

function createdAtJourneyCursor(
  cursor: string | undefined,
): CreatedAtJourneyPageCursor | undefined {
  if (cursor === undefined) return undefined;
  const payload = decodeCursor(cursor);
  const createdAt = cursorString(payload.createdAt);
  const parsed = new Date(createdAt);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== createdAt) {
    throw AppErrors.badCursor();
  }
  return { createdAt, id: cursorString(payload.id) };
}

function updatePlans(input: UpdateLInput): LUpdatePlans {
  return Object.fromEntries(
    lTypeSchema.options.map((currentType) => [
      currentType,
      {
        data: buildUpdateData(input, input.type ?? currentType),
        reputation: reputationDeltaForTypeChange(currentType, input.type),
      },
    ]),
  ) as LUpdatePlans;
}

function updatePlansV2(input: UpdateLInputV2): LUpdatePlans {
  return Object.fromEntries(
    lTypeSchema.options.map((currentType) => [
      currentType,
      {
        data: buildUpdateDataV2(input, input.type ?? currentType),
        reputation: reputationDeltaForTypeChange(currentType, input.type),
      },
    ]),
  ) as LUpdatePlans;
}

@Injectable()
export class LsService {
  constructor(private readonly repo: LsRepository) {}

  // ─── Reads ────────────────────────────────────────────────────────────────

  /** Finds an L and asserts the viewer may see it; returns the entity (for reactions/comments). */
  async getViewableL(id: string, viewerId: string | undefined): Promise<LWithAuthor> {
    const l = await this.repo.findById(id);
    if (!l) throw AppErrors.lNotFound();
    await this.assertCanView(l, viewerId);
    return l;
  }

  async getDetail(id: string, viewerId: string | undefined): Promise<LDetail> {
    const l = await this.repo.findById(id);
    if (!l) throw AppErrors.lNotFound();
    await this.assertCanView(l, viewerId);
    const [collections, reactionMap] = await Promise.all([
      l.isAnonymous && viewerId !== l.authorId ? Promise.resolve([]) : this.repo.collectionsForL(id),
      this.reactionMap(viewerId, [id]),
    ]);
    return toLDetail(
      l,
      { reactions: reactionMap.get(id) ?? [], canEdit: viewerId === l.authorId },
      collections,
    );
  }

  async getDetailV2(id: string, viewerId: string | undefined): Promise<LDetailV2> {
    const l = await this.repo.findById(id);
    if (!l) throw AppErrors.lNotFound();
    await this.assertCanView(l, viewerId);
    const [collections, reactionMap] = await Promise.all([
      l.isAnonymous && viewerId !== l.authorId ? Promise.resolve([]) : this.repo.collectionsForL(id),
      this.reactionMap(viewerId, [id]),
    ]);
    return toV2LDetail(
      l,
      { reactions: reactionMap.get(id) ?? [], canEdit: viewerId === l.authorId },
      collections,
    );
  }

  async getFeed(query: FeedQuery, viewerId: string | undefined): Promise<Paginated<LCard>> {
    const page = await this.repo.feed({
      visibilities: ['PUBLIC'],
      category: query.filter ? FEED_FILTER_TO_CATEGORY[query.filter] : undefined,
      sort: query.sort,
      limit: query.limit,
      cursor: feedCursor(query.sort, query.cursor),
    });
    return { data: await this.toCards(page.rows, viewerId), nextCursor: page.nextCursor };
  }

  async getFeedV2(
    query: FeedQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<LCardV2>> {
    const page = await this.repo.feed({
      visibilities: ['PUBLIC'],
      sort: query.sort,
      limit: query.limit,
      cursor: feedCursor(query.sort, query.cursor),
    });
    return { data: await this.toV2Cards(page.rows, viewerId), nextCursor: page.nextCursor };
  }

  async getFollowingFeed(userId: string, query: FeedQuery): Promise<Paginated<LCard>> {
    const page = await this.repo.feed({
      visibilities: ['PUBLIC', 'FOLLOWERS'],
      followedByUserId: userId,
      category: query.filter ? FEED_FILTER_TO_CATEGORY[query.filter] : undefined,
      sort: query.sort,
      limit: query.limit,
      cursor: feedCursor(query.sort, query.cursor),
    });
    return { data: await this.toCards(page.rows, userId), nextCursor: page.nextCursor };
  }

  async getFollowingFeedV2(
    userId: string,
    query: FeedQueryV2,
  ): Promise<Paginated<LCardV2>> {
    const page = await this.repo.feed({
      visibilities: ['PUBLIC', 'FOLLOWERS'],
      followedByUserId: userId,
      sort: query.sort,
      limit: query.limit,
      cursor: feedCursor(query.sort, query.cursor),
    });
    return { data: await this.toV2Cards(page.rows, userId), nextCursor: page.nextCursor };
  }

  async getUserLs(
    authorId: string,
    query: UserLsQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<LCard>> {
    const visibilities = await this.allowedVisibilities(viewerId, authorId);
    const page = await this.repo.byAuthor({
      authorId,
      visibilities,
      includeAnonymous: viewerId === authorId,
      type: query.type,
      limit: query.limit,
      cursorId: cursorField(query.cursor, 'id'),
    });
    return { data: await this.toCards(page.rows, viewerId), nextCursor: page.nextCursor };
  }

  async getUserLsV2(
    authorId: string,
    query: UserLsQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<LCardV2>> {
    const visibilities = await this.allowedVisibilities(viewerId, authorId);
    const page = await this.repo.byAuthor({
      authorId,
      visibilities,
      includeAnonymous: viewerId === authorId,
      type: query.type,
      limit: query.limit,
      cursorId: cursorField(query.cursor, 'id'),
    });
    return { data: await this.toV2Cards(page.rows, viewerId), nextCursor: page.nextCursor };
  }

  async getJourney(
    authorId: string,
    query: JourneyQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<JourneyNode>> {
    const visibilities = await this.allowedVisibilities(viewerId, authorId);
    const page = await this.repo.journey({
      authorId,
      visibilities,
      includeAnonymous: viewerId === authorId,
      limit: query.limit,
      cursor: journeyCursor(query.cursor),
    });
    return mapPage(page, toJourneyNode);
  }

  async getJourneyV2(
    authorId: string,
    query: JourneyQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<JourneyNodeV2>> {
    const visibilities = await this.allowedVisibilities(viewerId, authorId);
    const page = await this.repo.journeyByCreatedAt({
      authorId,
      visibilities,
      includeAnonymous: viewerId === authorId,
      limit: query.limit,
      cursor: createdAtJourneyCursor(query.cursor),
    });
    return mapPage(page, toV2JourneyNode);
  }

  async getSaved(userId: string, query: PaginationQuery): Promise<Paginated<LCard>> {
    const page = await this.repo.savedByUser(userId, query.limit, cursorField(query.cursor, 'rid'));
    return { data: await this.toCards(page.rows, userId), nextCursor: page.nextCursor };
  }

  async getSavedV2(userId: string, query: PaginationQuery): Promise<Paginated<LCardV2>> {
    const page = await this.repo.savedByUser(userId, query.limit, cursorField(query.cursor, 'rid'));
    return { data: await this.toV2Cards(page.rows, userId), nextCursor: page.nextCursor };
  }

  /** For search: hydrate ranked ids into cards, preserving rank order. */
  async getCardsByIds(ids: string[], viewerId: string | undefined): Promise<LCard[]> {
    const rows = await this.repo.hydrateOrdered(ids);
    return this.toCards(rows, viewerId);
  }

  /** Hydrate ids and re-check visibility, used when ids came from raw SQL before hydration. */
  async getVisibleCardsByIds(ids: string[], viewerId: string | undefined): Promise<LCard[]> {
    const rows = await this.repo.hydrateVisibleOrdered(ids, viewerId);
    return this.toCards(rows, viewerId);
  }

  async getVisibleCardsByIdsV2(
    ids: string[],
    viewerId: string | undefined,
  ): Promise<LCardV2[]> {
    const rows = await this.repo.hydrateVisibleOrdered(ids, viewerId);
    return this.toV2Cards(rows, viewerId);
  }

  /** For collections: hydrate ids in order, keeping only Ls the viewer may see. */
  async getCardsByIdsFiltered(
    ids: string[],
    viewerId: string | undefined,
    visibilities: Visibility[],
    includeAnonymous = true,
  ): Promise<LCard[]> {
    const rows = await this.repo.hydrateOrdered(ids);
    const allowed = new Set<Visibility>(visibilities);
    return this.toCards(
      rows.filter((row) => allowed.has(row.visibility) && (includeAnonymous || !row.isAnonymous)),
      viewerId,
    );
  }

  async getCardsByIdsFilteredV2(
    ids: string[],
    viewerId: string | undefined,
    visibilities: Visibility[],
    includeAnonymous = true,
  ): Promise<LCardV2[]> {
    const rows = await this.repo.hydrateOrdered(ids);
    const allowed = new Set<Visibility>(visibilities);
    return this.toV2Cards(
      rows.filter((row) => allowed.has(row.visibility) && (includeAnonymous || !row.isAnonymous)),
      viewerId,
    );
  }

  /** Which visibilities of `ownerId`'s content may `viewerId` see. */
  allowedVisibilitiesFor(viewerId: string | undefined, ownerId: string): Promise<Visibility[]> {
    return this.allowedVisibilities(viewerId, ownerId);
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(user: AuthUser, input: CreateLInput): Promise<LDetail> {
    if (!user.username) throw AppErrors.onboardingRequired();
    const data = normalizeCreate(input);
    const l = await this.repo.createL(user.id, data, reputationForType(data.type));
    return toLDetail(l, { reactions: [], canEdit: true }, []);
  }

  async createV2(user: AuthUser, input: CreateLInputV2): Promise<LDetailV2> {
    if (!user.username) throw AppErrors.onboardingRequired();
    const data = normalizeCreateV2(input);
    const l = await this.repo.createL(user.id, data, reputationForType(data.type));
    return toV2LDetail(l, { reactions: [], canEdit: true }, []);
  }

  async update(user: AuthUser, id: string, input: UpdateLInput): Promise<LDetail> {
    const result = await this.repo.updateOwnedL(
      id,
      user.id,
      updatePlans(input),
    );
    if (result.status === 'not_found') throw AppErrors.lNotFound();
    if (result.status === 'not_owner') throw AppErrors.notLOwner();
    const updated = result.row;
    const [collections, reactionMap] = await Promise.all([
      this.repo.collectionsForL(id),
      this.reactionMap(user.id, [id]),
    ]);
    return toLDetail(updated, { reactions: reactionMap.get(id) ?? [], canEdit: true }, collections);
  }

  async updateV2(user: AuthUser, id: string, input: UpdateLInputV2): Promise<LDetailV2> {
    const result = await this.repo.updateOwnedL(id, user.id, updatePlansV2(input));
    if (result.status === 'not_found') throw AppErrors.lNotFound();
    if (result.status === 'not_owner') throw AppErrors.notLOwner();
    const [collections, reactionMap] = await Promise.all([
      this.repo.collectionsForL(id),
      this.reactionMap(user.id, [id]),
    ]);
    return toV2LDetail(
      result.row,
      { reactions: reactionMap.get(id) ?? [], canEdit: true },
      collections,
    );
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const result = await this.repo.deleteOwnedL(id, user.id, planLDelete(user.id));
    if (result.status === 'not_found') throw AppErrors.lNotFound();
    if (result.status === 'not_owner') throw AppErrors.notLOwner();
    return { ok: true };
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async toCards(rows: LWithAuthor[], viewerId: string | undefined): Promise<LCard[]> {
    const reactionMap = await this.reactionMap(
      viewerId,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      toLCard(row, {
        reactions: reactionMap.get(row.id) ?? [],
        canEdit: viewerId === row.authorId,
      }),
    );
  }

  private async toV2Cards(
    rows: LWithAuthor[],
    viewerId: string | undefined,
  ): Promise<LCardV2[]> {
    const reactionMap = await this.reactionMap(
      viewerId,
      rows.map((row) => row.id),
    );
    return rows.map((row) =>
      toV2LCard(row, {
        reactions: reactionMap.get(row.id) ?? [],
        canEdit: viewerId === row.authorId,
      }),
    );
  }

  private async reactionMap(
    viewerId: string | undefined,
    lIds: string[],
  ): Promise<Map<string, ReactionType[]>> {
    const map = new Map<string, ReactionType[]>();
    if (!viewerId || lIds.length === 0) return map;
    const rows = await this.repo.viewerReactions(viewerId, lIds);
    for (const row of rows) {
      const existing = map.get(row.lId);
      if (existing) {
        existing.push(row.type);
      } else {
        map.set(row.lId, [row.type]);
      }
    }
    return map;
  }

  private async allowedVisibilities(
    viewerId: string | undefined,
    authorId: string,
  ): Promise<Visibility[]> {
    if (viewerId === authorId) return ALL_VISIBILITIES;
    const visibilities: Visibility[] = ['PUBLIC'];
    if (viewerId && (await this.repo.viewerFollows(viewerId, authorId))) {
      visibilities.push('FOLLOWERS');
    }
    return visibilities;
  }

  private async assertCanView(l: LWithAuthor, viewerId: string | undefined): Promise<void> {
    if (await this.canView(l, viewerId)) return;
    throw AppErrors.lNotFound();
  }

  private async canView(l: LWithAuthor, viewerId: string | undefined): Promise<boolean> {
    if (l.visibility === 'PUBLIC') return true;
    if (viewerId && viewerId === l.authorId) return true;
    if (
      l.visibility === 'FOLLOWERS' &&
      viewerId &&
      (await this.repo.viewerFollows(viewerId, l.authorId))
    ) {
      return true;
    }
    return false;
  }
}
