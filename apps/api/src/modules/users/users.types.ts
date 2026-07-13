import type { JourneyStatus } from '@linkedout/contracts';

export interface FollowCounts {
  followers: number;
  following: number;
}

/** Business-shaped user patch; the repository translates it to the persistence adapter. */
export interface UpdateUserData {
  username: string | undefined;
  name: string | null | undefined;
  bio: string | null | undefined;
  status: JourneyStatus | null | undefined;
  avatar:
    | {
        publicUrl: string;
        objectKey: string;
      }
    | null
    | undefined;
}
