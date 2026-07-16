import { Injectable } from '@nestjs/common';
import type { FeedSidebarResponse } from '@linkedout/contracts/v2';

import type { AuthUser } from '../../common/types/auth';

const REFRESH_AFTER_MS = 60_000;
const TOP_LS_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;

@Injectable()
export class FeedSidebarService {
  async load(_user: AuthUser | undefined): Promise<FeedSidebarResponse> {
    const generatedAt = new Date();
    return {
      contractVersion: 2,
      generatedAt: generatedAt.toISOString(),
      refreshAfter: new Date(generatedAt.getTime() + REFRESH_AFTER_MS).toISOString(),
      viewer: { state: 'SIGNED_OUT', profile: null },
      peopleToFollow: { personalized: false, items: [] },
      topLs: {
        basis: 'MOST_INTERACTED',
        window: {
          startsAt: new Date(generatedAt.getTime() - TOP_LS_WINDOW_MS).toISOString(),
          endsAt: generatedAt.toISOString(),
        },
        items: [],
      },
      lOfTheDay: null,
    };
  }
}
