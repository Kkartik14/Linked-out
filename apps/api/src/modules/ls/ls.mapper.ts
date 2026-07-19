import type {
  CollectionRef,
  JourneyNode,
  LCard,
  LDetail,
} from '@linkedout/contracts';

import type { LViewerContext } from '../../common/read-models/l-read-model';
import type { LWithAuthor } from './ls.repository';
import { cleanLCore, storyPreview } from './ls-wire.mapper';

function coreCard(l: LWithAuthor, viewer: LViewerContext) {
  return cleanLCore(l, viewer);
}

export function toLCard(l: LWithAuthor, viewer: LViewerContext): LCard {
  return { ...coreCard(l, viewer), storyPreview: storyPreview(l.story) };
}

export function toLDetail(
  l: LWithAuthor,
  viewer: LViewerContext,
  collections: CollectionRef[],
): LDetail {
  return { ...coreCard(l, viewer), story: l.story, collections };
}

export function toJourneyNode(l: LWithAuthor): JourneyNode {
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    createdAt: l.createdAt.toISOString(),
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt ? l.resolvedAt.toISOString() : null,
    reactionTotal: l.reactionCount,
    commentCount: l.commentCount,
  };
}
