import type { UserProfile } from '@linkedout/contracts';

import type { FollowCounts, UserProfileRow } from './users.repository';

export interface ProfileViewer {
  isSelf: boolean;
  isFollowing: boolean;
}

export function toUserProfile(
  user: UserProfileRow,
  counts: FollowCounts,
  viewer: ProfileViewer,
): UserProfile {
  return {
    id: user.id,
    username: user.username ?? '',
    name: user.name,
    image: user.image,
    bio: user.bio,
    status: user.status,
    reputation: {
      storiesShared: user.storiesShared,
      lessonsShared: user.lessonsShared,
      buildersHelped: user.buildersHelped,
      lsShared: user.lsShared,
      collectionsCreated: user.collectionsCreated,
    },
    counts,
    viewer: { isFollowing: viewer.isFollowing, isSelf: viewer.isSelf },
    createdAt: user.createdAt.toISOString(),
  };
}
