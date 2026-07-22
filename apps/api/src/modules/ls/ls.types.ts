import type { LType, Visibility } from '@linkedout/contracts';

/** Normalized business data for creating an L (optional/null semantics resolved). */
export interface WriteLData {
  title: string;
  story: string;
  type: LType;
  visibility: Visibility;
  isAnonymous: boolean;
}

/** Business-shaped patch data. Persistence-specific list operators are deliberately absent. */
export interface UpdateLData {
  title: string | undefined;
  story: string | undefined;
  type: LType | undefined;
  visibility: Visibility | undefined;
  isAnonymous: boolean | undefined;
  resolvedAt: Date | null | undefined;
}

export type ReputationField = 'lsShared' | 'storiesShared' | 'lessonsShared';
export type ReputationDelta = Partial<Record<ReputationField, number>>;

/** Fully resolved business plan selected by the repository using the locked current type. */
export interface LUpdatePlan {
  data: UpdateLData;
  reputation: ReputationDelta;
}

export type LUpdatePlans = Record<LType, LUpdatePlan>;

export interface LDeletePlan {
  reputationByType: Record<LType, ReputationDelta>;
}

export type FeedPageCursor =
  | { sort: 'latest'; id: string }
  | { sort: 'popular'; id: string; score: number }
  | { sort: 'helpful'; id: string; count: number };

export type OwnedLWriteResult<T> =
  | { status: 'ok'; row: T }
  | { status: 'not_found' }
  | { status: 'not_owner' };
