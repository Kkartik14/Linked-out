import type {
  AuthMeResponse,
  FeedSidebarResponse,
  FeedSidebarViewer,
  LCard,
  SuggestedUser,
  UserSummary,
} from "@linkedout/contracts/v2";

/**
 * Development fixture for `GET /v2/feed/sidebar`, which the backend has not shipped yet
 * (docs/api-contract-v2.md — "backend route implementation pending").
 *
 * It exists so the rails can be built and reviewed against the real contract instead of
 * against a guess: `getFeedSidebar` parses whatever this returns through
 * `feedSidebarResponseSchema`, so any drift from the contract fails loudly at the seam.
 *
 * DELETE THIS DIRECTORY when the route ships — see `getFeedSidebar` in `../endpoints`.
 * It is reached only when `NEXT_PUBLIC_FEED_SIDEBAR_FIXTURE=1`.
 */

const DAY_MS = 86_400_000;
const TOP_LS_WINDOW_DAYS = 7;
const REFRESH_AFTER_MS = 60_000;

/** Midnight UTC opening the calendar day `at` falls in. */
function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

const RUPA: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC0",
  username: "rupa",
  name: "Rupa Iyer",
  image: null,
  status: "RECOVERING",
};
const DEV: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC1",
  username: "devansh",
  name: "Devansh Mehta",
  image: null,
  status: "INTERVIEWING",
};
const MAYA: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC2",
  username: "maya",
  name: "Maya Okonkwo",
  image: null,
  status: "STARTING_UP",
};
const TOMAS: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC3",
  username: "tomas",
  name: "Tomás Reyes",
  image: null,
  status: "BUILDING",
};
const NADIA: UserSummary = {
  id: "01ARZ3NDEKTSV4RRFFQ69G5FC4",
  username: "nadia",
  name: "Nadia Ray",
  image: null,
  status: "WORKING",
};

/** A card with the boring parts filled in, so each L below states only what matters. */
function card(
  over: Pick<LCard, "id" | "title" | "storyPreview" | "type" | "author" | "isAnonymous"> &
    Partial<LCard>,
): LCard {
  return {
    visibility: "PUBLIC",
    resolvedAt: null,
    reactions: { total: 0, beenThere: 0, helpful: 0, respect: 0, pain: 0, saved: 0 },
    commentCount: 0,
    viewer: { reactions: [], canEdit: false },
    createdAt: "2026-07-14T09:30:00.000Z",
    ...over,
  };
}

const TOP_LS: { l: LCard; interactionCount: number; interactionLabel: string }[] = [
  {
    l: card({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FB0",
      title: "We shipped to 40,000 users with a migration that had never been tested",
      storyPreview:
        "The rollback took nine minutes. Understanding why we felt safe enough to skip the dry run took nine months.",
      type: "SCAR",
      author: TOMAS,
      isAnonymous: false,
      reactions: { total: 61, beenThere: 34, helpful: 18, respect: 9, pain: 0, saved: 12 },
      commentCount: 11,
    }),
    interactionCount: 34,
    interactionLabel: "34 builders interacted",
  },
  {
    l: card({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FB1",
      title: "I burned out and told nobody for seven months",
      storyPreview:
        "I kept shipping the whole time. That is the part I want other people to hear, because it is why nobody noticed.",
      type: "SCAR",
      // Anonymous Ls are eligible for Top Ls (contract v2 §2), and stay unattributed.
      author: null,
      isAnonymous: true,
      reactions: { total: 48, beenThere: 27, helpful: 14, respect: 7, pain: 0, saved: 19 },
      commentCount: 23,
    }),
    interactionCount: 27,
    interactionLabel: "27 builders interacted",
  },
  {
    l: card({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FB2",
      title: "Rejected in the final round, three times, by the same company",
      storyPreview:
        "Each loop got further. I have stopped reading that as encouragement and started reading it as data.",
      type: "STORY",
      author: DEV,
      isAnonymous: false,
      reactions: { total: 30, beenThere: 19, helpful: 8, respect: 3, pain: 0, saved: 4 },
      commentCount: 6,
    }),
    interactionCount: 19,
    interactionLabel: "19 builders interacted",
  },
  {
    l: card({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FB3",
      title: "Looking for product-market fit, month fourteen",
      storyPreview:
        "Still building. Still unsure. Writing it down here so the middle of the story exists somewhere too.",
      type: "BATTLE",
      author: MAYA,
      isAnonymous: false,
      reactions: { total: 21, beenThere: 12, helpful: 6, respect: 3, pain: 0, saved: 5 },
      commentCount: 9,
    }),
    interactionCount: 12,
    interactionLabel: "12 builders interacted",
  },
  {
    l: card({
      id: "01ARZ3NDEKTSV4RRFFQ69G5FB4",
      title: "Ship before it is perfect — I finally believe it",
      storyPreview:
        "It took shipping something genuinely embarrassing, and watching nothing bad happen at all.",
      type: "LESSON",
      author: NADIA,
      isAnonymous: false,
      reactions: { total: 14, beenThere: 3, helpful: 8, respect: 3, pain: 0, saved: 2 },
      commentCount: 2,
    }),
    interactionCount: 8,
    interactionLabel: "8 builders interacted",
  },
];

/** L of the day must be PUBLIC, attributed, and by an onboarded author (contract v2 §2). */
const DAILY = {
  l: card({
    id: "01ARZ3NDEKTSV4RRFFQ69G5FB5",
    title: "The startup died on a Tuesday. I want to talk about the Wednesday.",
    storyPreview:
      "Three years, one pivot, eleven people. Everybody asks how it ended. Almost nobody asks what the next morning was like.",
    type: "STORY",
    author: RUPA,
    isAnonymous: false,
    reactions: { total: 88, beenThere: 41, helpful: 26, respect: 21, pain: 0, saved: 31 },
    commentCount: 34,
    createdAt: "2026-07-16T08:15:00.000Z",
  }),
  interactionCount: 41,
  interactionLabel: "41 builders interacted",
} satisfies { l: LCard; interactionCount: number; interactionLabel: string };

/** Ordered as the backend would rank them: mutual follows first, then activity. */
const SUGGESTIONS: readonly Omit<SuggestedUser, "viewer">[] = [
  { user: RUPA, reason: { code: "MUTUAL_FOLLOWS", count: 3, text: "3 mutual follows" } },
  { user: MAYA, reason: { code: "MUTUAL_FOLLOWS", count: 1, text: "1 mutual follow" } },
  { user: DEV, reason: { code: "ACTIVE_BUILDER", text: "Active builder this week" } },
  { user: TOMAS, reason: { code: "ACTIVE_BUILDER", text: "Active builder this week" } },
];

function viewerFor(me: AuthMeResponse): FeedSidebarViewer {
  if (!me.user) return { state: "SIGNED_OUT", profile: null };
  return me.needsOnboarding
    ? { state: "ONBOARDING_REQUIRED", profile: me.user }
    : { state: "READY", profile: me.user };
}

/**
 * A response shaped exactly as the endpoint will send it, for `now`.
 *
 * Windows are derived from `now` rather than hardcoded, so the fixture stays honest as
 * time passes and stays deterministic when a test pins the clock.
 */
export function makeFeedSidebarFixture(now: Date, me: AuthMeResponse): FeedSidebarResponse {
  const viewer = viewerFor(me);
  const ready = viewer.state === "READY";
  const todayStart = startOfUtcDay(now);

  return {
    contractVersion: 2,
    generatedAt: now.toISOString(),
    refreshAfter: new Date(now.getTime() + REFRESH_AFTER_MS).toISOString(),
    viewer,
    peopleToFollow: {
      // Only a READY viewer gets personalization; everyone else gets the global fallback.
      personalized: ready,
      items: SUGGESTIONS.filter((s) => s.user.id !== me.user?.id)
        .slice(0, 5)
        .map((s) => ({ ...s, viewer: { canFollow: ready } })),
    },
    topLs: {
      basis: "MOST_INTERACTED",
      window: {
        startsAt: new Date(now.getTime() - TOP_LS_WINDOW_DAYS * DAY_MS).toISOString(),
        endsAt: now.toISOString(),
      },
      items: TOP_LS.slice(0, 5),
    },
    lOfTheDay: {
      selectedFor: now.toISOString().slice(0, 10),
      basis: "MOST_INTERACTED",
      // The previous completed UTC day: inclusive start, exclusive end.
      window: {
        startsAt: new Date(todayStart.getTime() - DAY_MS).toISOString(),
        endsAt: todayStart.toISOString(),
      },
      item: { ...DAILY, l: { ...DAILY.l, isAnonymous: false, author: RUPA } },
    },
  };
}
