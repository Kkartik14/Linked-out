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
import {
  groupViewerReactions,
  lAudiencePolicy,
  mapLRows,
  type LViewerContext,
} from '../../common/read-models/l-read-model';
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
    const detail = await this.detailState(id, viewerId);
    return toLDetail(detail.l, detail.viewer, detail.collections);
  }

  async getDetailV2(id: string, viewerId: string | undefined): Promise<LDetailV2> {
    const detail = await this.detailState(id, viewerId);
    return toV2LDetail(detail.l, detail.viewer, detail.collections);
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

  async getUserLsByUsernameV2(
    username: string,
    query: UserLsQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<LCardV2>> {
    return this.getUserLsV2(await this.requireAuthorId(username), query, viewerId);
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

  async getJourneyByUsernameV2(
    username: string,
    query: JourneyQueryV2,
    viewerId: string | undefined,
  ): Promise<Paginated<JourneyNodeV2>> {
    return this.getJourneyV2(await this.requireAuthorId(username), query, viewerId);
  }

  async getSaved(userId: string, query: PaginationQuery): Promise<Paginated<LCard>> {
    const page = await this.repo.savedByUser(userId, query.limit, cursorField(query.cursor, 'rid'));
    return { data: await this.toCards(page.rows, userId), nextCursor: page.nextCursor };
  }

  async getSavedV2(userId: string, query: PaginationQuery): Promise<Paginated<LCardV2>> {
    const page = await this.repo.savedByUser(userId, query.limit, cursorField(query.cursor, 'rid'));
    return { data: await this.toV2Cards(page.rows, userId), nextCursor: page.nextCursor };
  }

  // ─── Writes ───────────────────────────────────────────────────────────────

  async create(user: AuthUser, input: CreateLInput): Promise<LDetail> {
    const l = await this.createRow(user, normalizeCreate(input));
    return toLDetail(l, { reactions: [], canEdit: true }, []);
  }

  async createV2(user: AuthUser, input: CreateLInputV2): Promise<LDetailV2> {
    const l = await this.createRow(user, normalizeCreateV2(input));
    return toV2LDetail(l, { reactions: [], canEdit: true }, []);
  }

  async update(user: AuthUser, id: string, input: UpdateLInput): Promise<LDetail> {
    const detail = await this.updateState(user, id, updatePlans(input));
    return toLDetail(detail.l, detail.viewer, detail.collections);
  }

  async updateV2(user: AuthUser, id: string, input: UpdateLInputV2): Promise<LDetailV2> {
    const detail = await this.updateState(user, id, updatePlansV2(input));
    return toV2LDetail(detail.l, detail.viewer, detail.collections);
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const result = await this.repo.deleteOwnedL(id, user.id, planLDelete(user.id));
    if (result.status === 'not_found') throw AppErrors.lNotFound();
    if (result.status === 'not_owner') throw AppErrors.notLOwner();
    return { ok: true };
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  private async toCards(rows: LWithAuthor[], viewerId: string | undefined): Promise<LCard[]> {
    return mapLRows(
      rows,
      viewerId,
      await this.reactionMap(
        viewerId,
        rows.map((row) => row.id),
      ),
      toLCard,
    );
  }

  private async toV2Cards(
    rows: LWithAuthor[],
    viewerId: string | undefined,
  ): Promise<LCardV2[]> {
    return mapLRows(
      rows,
      viewerId,
      await this.reactionMap(
        viewerId,
        rows.map((row) => row.id),
      ),
      toV2LCard,
    );
  }

  private async reactionMap(
    viewerId: string | undefined,
    lIds: string[],
  ): Promise<Map<string, ReactionType[]>> {
    if (!viewerId || lIds.length === 0) return new Map();
    return groupViewerReactions(await this.repo.viewerReactions(viewerId, lIds));
  }

  private async detailState(id: string, viewerId: string | undefined) {
    const l = await this.repo.findById(id);
    if (!l) throw AppErrors.lNotFound();
    await this.assertCanView(l, viewerId);
    const [collections, reactionMap] = await Promise.all([
      l.isAnonymous && viewerId !== l.authorId
        ? Promise.resolve([])
        : this.repo.collectionsForL(id),
      this.reactionMap(viewerId, [id]),
    ]);
    return {
      l,
      collections,
      viewer: {
        reactions: reactionMap.get(id) ?? [],
        canEdit: viewerId === l.authorId,
      } satisfies LViewerContext,
    };
  }

  private async createRow(user: AuthUser, data: WriteLData): Promise<LWithAuthor> {
    if (!user.username) throw AppErrors.onboardingRequired();
    return this.repo.createL(user.id, data, reputationForType(data.type));
  }

  private async updateState(user: AuthUser, id: string, plans: LUpdatePlans) {
    const result = await this.repo.updateOwnedL(id, user.id, plans);
    if (result.status === 'not_found') throw AppErrors.lNotFound();
    if (result.status === 'not_owner') throw AppErrors.notLOwner();
    const [collections, reactionMap] = await Promise.all([
      this.repo.collectionsForL(id),
      this.reactionMap(user.id, [id]),
    ]);
    return {
      l: result.row,
      collections,
      viewer: { reactions: reactionMap.get(id) ?? [], canEdit: true } satisfies LViewerContext,
    };
  }

  private async requireAuthorId(username: string): Promise<string> {
    const author = await this.repo.authorIdByUsername(username);
    if (!author) throw AppErrors.userNotFound();
    return author.id;
  }

  private async allowedVisibilities(
    viewerId: string | undefined,
    authorId: string,
  ): Promise<Visibility[]> {
    const isFollowing = Boolean(
      viewerId && viewerId !== authorId && (await this.repo.viewerFollows(viewerId, authorId)),
    );
    return lAudiencePolicy(viewerId, authorId, isFollowing).visibilities;
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
