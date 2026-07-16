import type { ReactionType, ReactionsSummary } from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { LWithAuthor } from './ls.repository';

const PREVIEW_LENGTH = 280;

export interface LViewerContext {
  reactions: ReactionType[];
  canEdit: boolean;
}

export function storyPreview(story: string): string {
  if (story.length <= PREVIEW_LENGTH) return story;
  return `${story.slice(0, PREVIEW_LENGTH).trimEnd()}…`;
}

export function reactionsSummary(l: LWithAuthor): ReactionsSummary {
  return {
    total: l.reactionCount,
    beenThere: l.beenThereCount,
    helpful: l.helpfulCount,
    respect: l.respectCount,
    pain: l.painCount,
    saved: l.savedCount,
  };
}

export function cleanLCore(l: LWithAuthor, viewer: LViewerContext) {
  return {
    id: l.id,
    title: l.title,
    type: l.type,
    visibility: l.visibility,
    isAnonymous: l.isAnonymous,
    resolvedAt: l.resolvedAt ? l.resolvedAt.toISOString() : null,
    author: l.isAnonymous ? null : toUserSummary(l.author),
    reactions: reactionsSummary(l),
    commentCount: l.commentCount,
    viewer: { reactions: viewer.reactions, canEdit: viewer.canEdit },
    createdAt: l.createdAt.toISOString(),
  } as const;
}
