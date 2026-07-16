import type { Collection, CollectionDetail, LCard } from '@linkedout/contracts';
import type {
  CollectionDetail as CollectionDetailV2,
  LCard as LCardV2,
} from '@linkedout/contracts/v2';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { CollectionWithMeta } from './collections.repository';

export function toCollection(
  c: CollectionWithMeta,
  lCount = c._count.ls,
  viewerId?: string,
): Collection {
  return {
    id: c.id,
    title: c.title,
    slug: c.slug,
    owner: toUserSummary(c.owner),
    lCount,
    viewer: { canEdit: viewerId === c.ownerId },
    createdAt: c.createdAt.toISOString(),
  };
}

export function toCollectionDetail(
  c: CollectionWithMeta,
  ls: LCard[],
  viewerId?: string,
): CollectionDetail {
  return { ...toCollection(c, ls.length, viewerId), ls };
}

export function toV2CollectionDetail(
  c: CollectionWithMeta,
  ls: LCardV2[],
  viewerId?: string,
): CollectionDetailV2 {
  return { ...toCollection(c, ls.length, viewerId), ls };
}
