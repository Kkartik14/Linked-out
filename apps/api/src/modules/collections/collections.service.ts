import { Injectable } from '@nestjs/common';
import { ulid } from 'ulid';
import type {
  AddLToCollectionInput,
  Collection,
  CollectionDetail,
  CreateCollectionInput,
  Paginated,
  PaginationQuery,
  UpdateCollectionInput,
} from '@linkedout/contracts';

import { AppErrors } from '../../common/errors/app-exception';
import { decodeCursorId } from '../../common/pagination/cursor';
import { mapPage } from '../../common/pagination/paginate';
import type { AuthUser } from '../../common/types/auth';
import { LsService } from '../ls/ls.service';
import { UsersService } from '../users/users.service';
import { CollectionsRepository, type CollectionWithMeta } from './collections.repository';
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
  constructor(
    private readonly repo: CollectionsRepository,
    private readonly ls: LsService,
    private readonly users: UsersService,
  ) {}

  async create(user: AuthUser, input: CreateCollectionInput): Promise<Collection> {
    if (!user.username) throw AppErrors.onboardingRequired();
    let slug = slugify(input.title);
    if (await this.repo.slugTaken(user.id, slug)) {
      slug = `${slug}-${ulid().slice(-6).toLowerCase()}`;
    }
    const collection = await this.repo.create(user.id, input.title, slug);
    return toCollection(collection);
  }

  async getDetail(id: string, viewerId: string | undefined): Promise<CollectionDetail> {
    const collection = await this.repo.findById(id);
    if (!collection) throw AppErrors.collectionNotFound();
    return this.detailFor(collection, viewerId);
  }

  async rename(user: AuthUser, id: string, input: UpdateCollectionInput): Promise<Collection> {
    await this.assertOwner(id, user.id);
    let slug = slugify(input.title);
    if (await this.repo.slugTaken(user.id, slug)) {
      slug = `${slug}-${ulid().slice(-6).toLowerCase()}`;
    }
    return toCollection(await this.repo.update(id, input.title, slug));
  }

  async remove(user: AuthUser, id: string): Promise<{ ok: true }> {
    await this.assertOwner(id, user.id);
    await this.repo.delete(id, user.id);
    return { ok: true };
  }

  async addL(
    user: AuthUser,
    id: string,
    lId: string,
    input: AddLToCollectionInput,
  ): Promise<CollectionDetail> {
    await this.assertOwner(id, user.id);
    const owner = await this.repo.lOwner(lId);
    if (!owner) throw AppErrors.lNotFound();
    if (owner.authorId !== user.id) {
      throw AppErrors.forbidden('You can only add your own Ls to a collection.');
    }
    const position = input.position ?? (await this.repo.orderedLIds(id)).length;
    await this.repo.addL(id, lId, position);
    return this.getDetail(id, user.id);
  }

  async removeL(user: AuthUser, id: string, lId: string): Promise<CollectionDetail> {
    await this.assertOwner(id, user.id);
    await this.repo.removeL(id, lId);
    return this.getDetail(id, user.id);
  }

  async listByOwner(
    username: string,
    query: PaginationQuery,
    _viewerId: string | undefined,
  ): Promise<Paginated<Collection>> {
    const ownerId = await this.users.requireUserId(username);
    const page = await this.repo.listByOwner(ownerId, query.limit, decodeCursorId(query.cursor));
    return mapPage(page, toCollection);
  }

  private async detailFor(
    collection: CollectionWithMeta,
    viewerId: string | undefined,
  ): Promise<CollectionDetail> {
    const ids = await this.repo.orderedLIds(collection.id);
    const visibilities = await this.ls.allowedVisibilitiesFor(viewerId, collection.ownerId);
    const cards = await this.ls.getCardsByIdsFiltered(ids, viewerId, visibilities);
    return toCollectionDetail(collection, cards);
  }

  private async assertOwner(id: string, userId: string): Promise<void> {
    const owner = await this.repo.findOwner(id);
    if (!owner) throw AppErrors.collectionNotFound();
    if (owner.ownerId !== userId) {
      throw AppErrors.forbidden('You can only modify your own collection.');
    }
  }
}
