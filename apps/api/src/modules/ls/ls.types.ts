import type { LCategory, LType, ReactionType, Visibility } from '@linkedout/contracts';

/** Normalized business data for creating an L (optional/null semantics resolved). */
export interface WriteLData {
  title: string;
  story: string;
  type: LType;
  category: LCategory | null;
  company: string | null;
  tags: string[];
  eventDate: Date | null;
  visibility: Visibility;
  isAnonymous: boolean;
}

/** Business-shaped patch data. Persistence-specific list operators are deliberately absent. */
export interface UpdateLData {
  title: string | undefined;
  story: string | undefined;
  type: LType | undefined;
  category: LCategory | null | undefined;
  company: string | null | undefined;
  tags: string[] | undefined;
  eventDate: Date | null | undefined;
  visibility: Visibility | undefined;
  isAnonymous: boolean | undefined;
  resolvedAt: Date | null | undefined;
}

export type ReputationField = 'lsShared' | 'storiesShared' | 'lessonsShared' | 'buildersHelped';
export type ReputationDelta = Partial<Record<ReputationField, number>>;

/** Fully resolved business plan selected by the repository using the locked current type. */
export interface LUpdatePlan {
  data: UpdateLData;
  reputation: ReputationDelta;
}

export type LUpdatePlans = Record<LType, LUpdatePlan>;

export interface LDeletePlan {
  reputationByType: Record<LType, ReputationDelta>;
  countedReactionReputation: {
    reactionType: ReactionType;
    excludeUserId: string;
    reputationField: ReputationField;
    pointsPerReaction: number;
  };
}

export type FeedPageCursor =
  | { sort: 'latest'; id: string }
  | { sort: 'popular'; id: string; score: number }
  | { sort: 'helpful'; id: string; count: number };

export interface JourneyPageCursor {
  date: string;
  id: string;
}

export interface CreatedAtJourneyPageCursor {
  createdAt: string;
  id: string;
}

export type OwnedLWriteResult<T> =
  | { status: 'ok'; row: T }
  | { status: 'not_found' }
  | { status: 'not_owner' };
