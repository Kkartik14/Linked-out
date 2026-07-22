import type { FollowListUser } from '@linkedout/contracts';

import { toUserSummary, type UserSummarySource } from '../../common/mappers/user-summary.mapper';

/**
 * Composes a follow-directory row from a user summary source and the viewer's relationship to it.
 * Pure — no DB access, safe to import anywhere.
 */
export function toFollowListUser(
  source: UserSummarySource,
  viewer: { isFollowing: boolean; isSelf: boolean },
): FollowListUser {
  return { user: toUserSummary(source), viewer };
}
