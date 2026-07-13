import type { ReactionType } from '@linkedout/contracts';

/**
 * Lifetime popularity policy for feed ranking.
 *
 * This is intentionally named popularity, not trending: without time decay it measures
 * accumulated engagement. Keep runtime values here, outside persistence repositories, so
 * reactions and comments share one explicit business seam. The CJS seed mirror is parity-
 * checked against these exports in seed-policy.test.cjs.
 */
export const REACTION_POPULARITY_WEIGHT = Object.freeze({
  BEEN_THERE: 2,
  HELPFUL: 3,
  RESPECT: 2,
  PAIN: 1,
  // Saving is private library intent, not a public ranking signal.
  SAVED: 0,
}) satisfies Readonly<Record<ReactionType, number>>;

export const COMMENT_POPULARITY_WEIGHT = 2;

export function reactionPopularityDelta(type: ReactionType, sign: 1 | -1): number {
  return sign * REACTION_POPULARITY_WEIGHT[type];
}

export function commentPopularityPoints(count: number): number {
  return count * COMMENT_POPULARITY_WEIGHT;
}
