'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const v2 = require('@linkedout/contracts/v2');

const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const L_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';

function userSummary() {
  return {
    id: USER_ID,
    username: 'builder',
    name: 'A Builder',
    image: null,
    status: 'BUILDING',
  };
}

function lCard() {
  return {
    id: L_ID,
    title: 'The launch missed, and this is what changed',
    storyPreview: 'A short account of the failed launch and the lesson.',
    type: 'LESSON',
    visibility: 'PUBLIC',
    isAnonymous: false,
    resolvedAt: null,
    author: userSummary(),
    reactions: {
      total: 12,
      beenThere: 3,
      helpful: 5,
      respect: 3,
      pain: 1,
      saved: 2,
    },
    commentCount: 4,
    viewer: { reactions: [], canEdit: false },
    createdAt: '2026-07-15T09:00:00.000Z',
  };
}

test('v2 L inputs strictly reject every removed field', () => {
  const base = { title: 'A useful L', story: 'What happened and what I learned.' };

  for (const field of ['category', 'company', 'tags', 'eventDate']) {
    const result = v2.createLInputSchema.safeParse({ ...base, [field]: null });
    assert.equal(result.success, false, `create rejects ${field}`);

    const update = v2.updateLInputSchema.safeParse({ [field]: null });
    assert.equal(update.success, false, `update rejects ${field}`);
  }
});

test('v2 queries reject legacy category filters', () => {
  assert.equal(v2.feedQuerySchema.safeParse({ filter: 'interviews' }).success, false);
  assert.equal(
    v2.searchQuerySchema.safeParse({ q: 'interview', filter: 'interviews' }).success,
    false,
  );
  assert.equal(v2.feedQuerySchema.parse({}).sort, 'latest');
  assert.deepEqual(v2.feedSidebarQuerySchema.parse({}), {});
  assert.equal(v2.feedSidebarQuerySchema.safeParse({ limit: '5' }).success, false);
});

test('v2 package does not export removed category or tag-discovery contracts', () => {
  for (const name of [
    'lCategorySchema',
    'L_CATEGORY_META',
    'feedFilterSchema',
    'FEED_FILTER_TO_CATEGORY',
    'popularTagsQuerySchema',
    'popularTagsResponseSchema',
  ]) {
    assert.equal(name in v2, false, `${name} is absent from @linkedout/contracts/v2`);
  }

  const meta = v2.metaEnumsResponseSchema.parse({
    reactionType: [],
    journeyStatus: [],
    lType: [],
    visibility: [],
    notificationType: [],
    reputation: [],
  });
  assert.equal('lCategory' in meta, false);
});

test('OAuth failure copy is contract-valid and server-owned', () => {
  for (const failure of Object.values(v2.OAUTH_FAILURES)) {
    assert.deepEqual(v2.oauthFailureSchema.parse(failure), failure);
    assert.deepEqual(
      v2.oauthFailureRedirectQuerySchema.parse({ error: failure.code }),
      { error: failure.code },
    );
    assert.throws(() =>
      v2.oauthFailureRedirectQuerySchema.parse({
        error: failure.code,
        message: failure.message,
      }),
    );
  }
});

test('feed sidebar schema gives both rails one stable, attributed daily item', () => {
  const payload = {
    contractVersion: 2,
    generatedAt: '2026-07-17T02:00:00.000Z',
    refreshAfter: '2026-07-17T02:01:00.000Z',
    viewer: { state: 'SIGNED_OUT', profile: null },
    peopleToFollow: {
      personalized: false,
      items: [
        {
          user: userSummary(),
          reason: { code: 'ACTIVE_BUILDER', text: 'Active builder' },
          viewer: { canFollow: false },
        },
      ],
    },
    topLs: {
      basis: 'MOST_INTERACTED',
      window: {
        startsAt: '2026-07-10T02:00:00.000Z',
        endsAt: '2026-07-17T02:00:00.000Z',
      },
      windowLabel: 'Past 7 days',
      items: [],
    },
    lOfTheDay: {
      selectedFor: '2026-07-17',
      basis: 'MOST_INTERACTED',
      window: {
        startsAt: '2026-07-16T00:00:00.000Z',
        endsAt: '2026-07-17T00:00:00.000Z',
      },
      item: {
        l: lCard(),
        interactionCount: 9,
        interactionLabel: '9 builders interacted',
      },
    },
  };

  assert.deepEqual(v2.feedSidebarResponseSchema.parse(payload), payload);

  const anonymousDaily = structuredClone(payload);
  anonymousDaily.lOfTheDay.item.l.isAnonymous = true;
  anonymousDaily.lOfTheDay.item.l.author = null;
  assert.equal(v2.feedSidebarResponseSchema.safeParse(anonymousDaily).success, false);

  for (const mutate of [
    (value) => { value.peopleToFollow.items[0].user.email = 'private@example.com'; },
    (value) => { value.peopleToFollow.items[0].viewer.internal = true; },
    (value) => { value.lOfTheDay.item.l.author.email = 'private@example.com'; },
    (value) => { value.topLs.internal = true; },
  ]) {
    const leaked = structuredClone(payload);
    mutate(leaked);
    assert.equal(
      v2.feedSidebarResponseSchema.safeParse(leaked).success,
      false,
      'sidebar response rejects unknown nested fields instead of stripping them',
    );
  }
});
