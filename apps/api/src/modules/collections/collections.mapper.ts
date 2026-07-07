import type { Collection, CollectionDetail, LCard } from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { CollectionWithMeta } from './collections.repository';

export function toCollection(c: CollectionWithMeta): Collection {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    owner: toUserSummary(c.owner),
    lCount: c._count.ls,
    createdAt: c.createdAt.toISOString(),
  };
}

export function toCollectionDetail(c: CollectionWithMeta, ls: LCard[]): CollectionDetail {
  return { ...toCollection(c), ls };
}
