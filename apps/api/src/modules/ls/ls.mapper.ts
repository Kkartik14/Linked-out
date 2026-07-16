import type {
  CollectionRef,
  JourneyNode,
  LCard,
  LDetail,
} from '@linkedout/contracts';

import type { LWithAuthor } from './ls.repository';
import { cleanLCore, storyPreview, type LViewerContext } from './ls-wire.mapper';

export type { LViewerContext } from './ls-wire.mapper';

function coreCard(l: LWithAuthor, viewer: LViewerContext) {
  return {
    ...cleanLCore(l, viewer),
    category: l.category,
    company: l.company,
    tags: l.tags,
    eventDate: l.eventDate ? l.eventDate.toISOString() : null,
  } as const;
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
  const date = (l.eventDate ?? l.createdAt).toISOString();
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    category: l.category,
    company: l.company,
    eventDate: l.eventDate ? l.eventDate.toISOString() : null,
    date,
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt ? l.resolvedAt.toISOString() : null,
    reactionTotal: l.reactionCount,
    commentCount: l.commentCount,
  };
}
