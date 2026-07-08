import { Injectable } from '@nestjs/common';
import {
  FEED_FILTER_TO_CATEGORY,
  type CreateLInput,
  type FeedQuery,
  type JourneyNode,
  type JourneyQuery,
  type LCard,
  type LDetail,
  type Paginated,
  type PaginationQuery,
  type ReactionType,
  type UpdateLInput,
  type UserLsQuery,
} from '@linkedout/contracts';
import { Prisma, type LType, type Visibility } from '@linkedout/db';

import { AppErrors } from '../../common/errors/app-exception';
import { mapPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import {
  LsRepository,
  type LWithAuthor,
  type ReputationDelta,
  type WriteLData,
} from './ls.repository';
import { toJourneyNode, toLCard, toLDetail } from './ls.mapper';

const ALL_VISIBILITIES: Visibility[] = ['PUBLIC', 'FOLLOWERS', 'PRIVATE'];

function reputationForType(type: LType): ReputationDelta {
  const delta: ReputationDelta = { lsShared: 1 };
  if (type === 'STORY') delta.storiesShared = 1;
  if (type === 'LESSON') delta.lessonsShared = 1;
  return delta;
}

function reputationDeltaForTypeChange(from: LType, to: LType | undefined): ReputationDelta {
  if (to === undefined || to === from) return {};
  const before = reputationForType(from);
  const after = reputationForType(to);
  const delta: ReputationDelta = {};
  for (const field of ['storiesShared', 'lessonsShared'] as const) {
    const value = (after[field] ?? 0) - (before[field] ?? 0);
    if (value !== 0) delta[field] = value;
  }
  return delta;
}

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

function buildUpdateData(input: UpdateLInput, effectiveType: LType): Prisma.LUpdateInput {
  return {
    title: input.title,
    story: input.story,
    type: input.type,
    category: input.category,
    company: input.company,
    tags: input.tags ? { set: input.tags } : undefined,
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
      this.repo.collectionsForL(id),
      this.reactionMap(viewerId, [id]),
    ]);
    return toLDetail(
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
      cursor: query.cursor,
    });
    return { data: await this.toCards(page.rows, viewerId), nextCursor: page.nextCursor };
  }

  async getFollowingFeed(userId: string, query: FeedQuery): Promise<Paginated<LCard>> {
    const page = await this.repo.feed({
      visibilities: ['PUBLIC', 'FOLLOWERS'],
      followedByUserId: userId,
      category: query.filter ? FEED_FILTER_TO_CATEGORY[query.filter] : undefined,
      sort: query.sort,
      limit: query.limit,
      cursor: query.cursor,
    });
    return { data: await this.toCards(page.rows, userId), nextCursor: page.nextCursor };
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
      type: query.type,
      limit: query.limit,
      cursor: query.cursor,
    });
    return { data: await this.toCards(page.rows, viewerId), nextCursor: page.nextCursor };
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
      limit: query.limit,
      cursor: query.cursor,
    });
    return mapPage(page, toJourneyNode);
  }

  async getSaved(userId: string, query: PaginationQuery): Promise<Paginated<LCard>> {
    const page = await this.repo.savedByUser(userId, query.limit, query.cursor);
    return { data: await this.toCards(page.rows, userId), nextCursor: page.nextCursor };
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

  /** For collections: hydrate ids in order, keeping only Ls the viewer may see. */
  async getCardsByIdsFiltered(
    ids: string[],
    viewerId: string | undefined,
    visibilities: Visibility[],
  ): Promise<LCard[]> {
    const rows = await this.repo.hydrateOrdered(ids);
    const allowed = new Set<Visibility>(visibilities);
    return this.toCards(
      rows.filter((row) => allowed.has(row.visibility)),
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

  async update(user: AuthUser, id: string, input: UpdateLInput): Promise<LDetail> {
    const result = await this.repo.updateOwnedL(
      id,
      user.id,
      input.type,
      (effectiveType) => buildUpdateData(input, effectiveType),
      reputationDeltaForTypeChange,
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

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    const result = await this.repo.deleteOwnedL(id, user.id, reputationForType);
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
