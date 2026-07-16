import type { JourneyNode, LCard, LDetail } from '@linkedout/contracts/v2';

import type { LWithAuthor } from './ls.repository';
import { cleanLCore, storyPreview, type LViewerContext } from './ls-wire.mapper';

export function toV2LCard(l: LWithAuthor, viewer: LViewerContext): LCard {
  return { ...cleanLCore(l, viewer), storyPreview: storyPreview(l.story) };
}

export function toV2LDetail(
  l: LWithAuthor,
  viewer: LViewerContext,
  collections: Array<{ id: string; title: string; slug: string }>,
): LDetail {
  return { ...cleanLCore(l, viewer), story: l.story, collections };
}

export function toV2JourneyNode(l: LWithAuthor): JourneyNode {
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
