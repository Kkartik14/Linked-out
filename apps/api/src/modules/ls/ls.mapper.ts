import type {
  CollectionRef,
  JourneyNode,
  LCard,
  LDetail,
  ReactionType,
  ReactionsSummary,
} from '@linkedout/contracts';

import { toUserSummary } from '../../common/mappers/user-summary.mapper';
import type { LWithAuthor } from './ls.repository';

const PREVIEW_LENGTH = 280;

export interface LViewerContext {
  reactions: ReactionType[];
  canEdit: boolean;
}

function truncate(text: string, max: number = PREVIEW_LENGTH): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

function reactionsSummary(l: LWithAuthor): ReactionsSummary {
  return {
    total: l.reactionCount,
    beenThere: l.beenThereCount,
    helpful: l.helpfulCount,
    respect: l.respectCount,
    pain: l.painCount,
    saved: l.savedCount,
  };
}

function coreCard(l: LWithAuthor, viewer: LViewerContext) {
  return {
    id: l.id,
    title: l.title,
    lessonLearned: l.lessonLearned,
    type: l.type,
    category: l.category,
    company: l.company,
    tags: l.tags,
    eventDate: l.eventDate ? l.eventDate.toISOString() : null,
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

export function toLCard(l: LWithAuthor, viewer: LViewerContext): LCard {
  return { ...coreCard(l, viewer), storyPreview: truncate(l.story) };
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
