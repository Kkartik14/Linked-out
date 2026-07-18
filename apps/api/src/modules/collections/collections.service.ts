import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  AddLToCollectionInput,
  Collection,
  CollectionDetail,
  CreateCollectionInput,
  LCard,
  Paginated,
  PaginationQuery,
  ReactionType,
  UpdateCollectionInput,
} from '@linkedout/contracts';
import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursorId } from '../../common/pagination/cursor';
import {
  groupViewerReactions,
  lAudiencePolicy,
  mapLRows,
  type LWithAuthor,
} from '../../common/read-models/l-read-model';
import type { AuthUser } from '../../common/types/auth';
import { toLCard } from '../ls/ls.mapper';
import {
  CollectionNotFoundError,
  CollectionSlugConflictError,
  CollectionsRepository,
  type CollectionWithMeta,
} from './collections.repository';
import { toCollection, toCollectionDetail } from './collections.mapper';

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : 'collection';
}

@Injectable()
export class CollectionsService {
  constructor(private readonly repo: CollectionsRepository) {}

  async create(user: AuthUser, input: CreateCollectionInput): Promise<Collection> {
    if (!user.username) throw AppErrors.onboardingRequired();
    let slug = slugify(input.title);
    if (await this.repo.slugTaken(user.id, slug)) {
      slug = `${slug}-${ulid().slice(-6).toLowerCase()}`;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return toCollection(await this.repo.create(user.id, input.title, slug), undefined, user.id);
      } catch (error) {
        if (!(error instanceof CollectionSlugConflictError) || attempt === 2) throw error;
        slug = `${slugify(input.title)}-${ulid().slice(-6).toLowerCase()}`;
      }
    }
    throw AppErrors.internal();
  }

  async getDetail(id: string, viewerId: string | undefined): Promise<CollectionDetail> {
    return this.detailFor(await this.requireCollection(id), viewerId);
  }

  async rename(user: AuthUser, id: string, input: UpdateCollectionInput): Promise<Collection> {
    await this.assertOwner(id, user.id);
    let slug = slugify(input.title);
    if (await this.repo.slugTaken(user.id, slug, id)) {
      slug = `${slug}-${ulid().slice(-6).toLowerCase()}`;
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return toCollection(await this.repo.update(id, input.title, slug), undefined, user.id);
      } catch (error) {
        if (error instanceof CollectionNotFoundError) throw AppErrors.collectionNotFound();
        if (!(error instanceof CollectionSlugConflictError) || attempt === 2) throw error;
        slug = `${slugify(input.title)}-${ulid().slice(-6).toLowerCase()}`;
      }
    }
    throw AppErrors.internal();
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    await this.assertOwner(id, user.id);
    try {
      await this.repo.delete(id, user.id);
    } catch (error) {
      if (error instanceof CollectionNotFoundError) throw AppErrors.collectionNotFound();
      throw error;
    }
    return { ok: true };
  }

  async addL(
    user: AuthUser,
    id: string,
    lId: string,
    input: AddLToCollectionInput,
  ): Promise<CollectionDetail> {
    return this.addLAndRead(user, id, lId, input.position, () => this.getDetail(id, user.id));
  }

  async removeL(user: AuthUser, id: string, lId: string): Promise<CollectionDetail> {
    return this.removeLAndRead(user, id, lId, () => this.getDetail(id, user.id));
  }

  async listByOwner(
    username: string,
    query: PaginationQuery,
    viewerId: string | undefined,
  ): Promise<Paginated<Collection>> {
    const owner = await this.repo.ownerIdByUsername(username);
    if (!owner) throw AppErrors.userNotFound();
    const ownerId = owner.id;
    const page = await this.repo.listByOwner(ownerId, query.limit, decodeCursorId(query.cursor));
    const policy = await this.audiencePolicy(viewerId, ownerId);
    const counts = await this.repo.visibleLCounts(
      page.rows.map((collection) => collection.id),
      policy.visibilities,
      policy.includeAnonymous,
    );
    const data = page.rows.map((collection) =>
      toCollection(collection, counts.get(collection.id) ?? 0, viewerId),
    );
    return { data, nextCursor: page.nextCursor };
  }

  private async detailFor(
    collection: CollectionWithMeta,
    viewerId: string | undefined,
  ): Promise<CollectionDetail> {
    const ids = await this.repo.orderedLIds(collection.id);
    const policy = await this.audiencePolicy(viewerId, collection.ownerId);
    const rows = await this.repo.visibleLs(ids, policy.visibilities, policy.includeAnonymous);
    const cards = await this.toCards(rows, viewerId);
    return toCollectionDetail(collection, cards, viewerId);
  }

  private async addLAndRead<T>(
    user: AuthUser,
    id: string,
    lId: string,
    position: number | undefined,
    read: () => Promise<T>,
  ): Promise<T> {
    await this.assertOwner(id, user.id);
    const owner = await this.repo.lOwner(lId);
    if (!owner) throw AppErrors.lNotFound();
    if (owner.authorId !== user.id) {
      throw AppErrors.forbidden('You can only add your own Ls to a collection.');
    }
    await this.repo.addL(id, lId, position);
    return read();
  }

  private async removeLAndRead<T>(
    user: AuthUser,
    id: string,
    lId: string,
    read: () => Promise<T>,
  ): Promise<T> {
    await this.assertOwner(id, user.id);
    await this.repo.removeL(id, lId);
    return read();
  }

  private async requireCollection(id: string): Promise<CollectionWithMeta> {
    const collection = await this.repo.findById(id);
    if (!collection) throw AppErrors.collectionNotFound();
    return collection;
  }

  private async toCards(
    rows: LWithAuthor[],
    viewerId: string | undefined,
  ): Promise<LCard[]> {
    return mapLRows(rows, viewerId, await this.reactionMap(viewerId, rows), toLCard);
  }

  private async reactionMap(
    viewerId: string | undefined,
    rows: LWithAuthor[],
  ): Promise<Map<string, ReactionType[]>> {
    if (!viewerId || rows.length === 0) return new Map();
    return groupViewerReactions(
      await this.repo.viewerReactions(
        viewerId,
        rows.map((row) => row.id),
      ),
    );
  }

  private async audiencePolicy(
    viewerId: string | undefined,
    ownerId: string,
  ) {
    const isFollowing = Boolean(
      viewerId && viewerId !== ownerId && (await this.repo.viewerFollows(viewerId, ownerId)),
    );
    return lAudiencePolicy(viewerId, ownerId, isFollowing);
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const owner = await this.repo.findOwner(id);
    if (!owner) throw AppErrors.collectionNotFound();
    if (owner.ownerId !== userId) {
      throw AppErrors.forbidden('You can only modify your own collection.');
    }
  }
}
