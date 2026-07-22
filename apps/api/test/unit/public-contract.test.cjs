'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const contracts = require('@linkedout/contracts');

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
    type: 'L',
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

test('the sole public L contract strictly rejects every removed field', () => {
  const base = { title: 'A useful L', story: 'What happened and what I learned.' };

  for (const field of ['category', 'company', 'tags', 'eventDate']) {
    assert.equal(
      contracts.createLInputSchema.safeParse({ ...base, [field]: null }).success,
      false,
      `create rejects ${field}`,
    );
    assert.equal(
      contracts.updateLInputSchema.safeParse({ [field]: null }).success,
      false,
      `update rejects ${field}`,
    );
  }
});

test('public queries reject removed category filters', () => {
  assert.equal(contracts.feedQuerySchema.safeParse({ filter: 'interviews' }).success, false);
  assert.equal(
    contracts.searchQuerySchema.safeParse({ q: 'interview', filter: 'interviews' }).success,
    false,
  );
  assert.equal(contracts.feedQuerySchema.parse({}).sort, 'latest');
  assert.deepEqual(contracts.feedSidebarQuerySchema.parse({}), {});
  assert.equal(contracts.feedSidebarQuerySchema.safeParse({ limit: '5' }).success, false);
});

test('root package does not export removed category or tag-discovery contracts', () => {
  for (const name of [
    'lCategorySchema',
    'L_CATEGORY_META',
    'feedFilterSchema',
    'FEED_FILTER_TO_CATEGORY',
    'popularTagsQuerySchema',
    'popularTagsResponseSchema',
  ]) {
    assert.equal(name in contracts, false, `${name} is absent from @linkedout/contracts`);
  }

  const meta = contracts.metaEnumsResponseSchema.parse({
    reactionType: [],
    journeyStatus: [],
    lType: [],
    visibility: [],
    notificationType: [],
    reputation: [],
  });
  assert.equal('lCategory' in meta, false);
});

test('public reputation contract exposes only active counters', () => {
  const reputation = {
    storiesShared: 2,
    lsShared: 8,
  };

  assert.deepEqual(contracts.reputationSchema.parse(reputation), reputation);
  assert.equal(
    contracts.reputationSchema.safeParse({ ...reputation, lessonsShared: 3 }).success,
    false,
    'retired Lessons Shared must not be silently accepted',
  );
  assert.equal(
    contracts.reputationSchema.safeParse({ ...reputation, buildersHelped: 5 }).success,
    false,
    'retired reputation keys must not be silently accepted',
  );
  assert.equal(
    contracts.REPUTATION_META.some((entry) => entry.key === 'buildersHelped'),
    false,
    'retired reputation copy must not remain in metadata',
  );
  assert.equal(
    contracts.metaEnumsResponseSchema.safeParse({
      reactionType: [],
      journeyStatus: [],
      lType: [],
      visibility: [],
      notificationType: [],
      reputation: [{ key: 'buildersHelped', label: 'Builders Helped' }],
    }).success,
    false,
    'retired reputation keys must be rejected on the metadata wire too',
  );
});

test('the public L type contract exposes exactly the six active types', () => {
  assert.deepEqual(contracts.lTypeSchema.options, [
    'L',
    'WIN',
    'STORY',
    'SCAR',
    'PLOT_TWIST',
    'BATTLE',
  ]);
  for (const retired of ['CHECKPOINT', 'LESSON']) {
    assert.equal(contracts.lTypeSchema.safeParse(retired).success, false);
  }
});

test('OAuth failure copy is contract-valid and server-owned', () => {
  for (const failure of Object.values(contracts.OAUTH_FAILURES)) {
    assert.deepEqual(contracts.oauthFailureSchema.parse(failure), failure);
    assert.deepEqual(contracts.oauthFailureRedirectQuerySchema.parse({ error: failure.code }), {
      error: failure.code,
    });
    assert.throws(() =>
      contracts.oauthFailureRedirectQuerySchema.parse({
        error: failure.code,
        message: failure.message,
      }),
    );
  }
});

test('feed sidebar schema gives both rails one stable, attributed daily item', () => {
  const payload = {
    contractVersion: 1,
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

  assert.deepEqual(contracts.feedSidebarResponseSchema.parse(payload), payload);

  const anonymousDaily = structuredClone(payload);
  anonymousDaily.lOfTheDay.item.l.isAnonymous = true;
  anonymousDaily.lOfTheDay.item.l.author = null;
  assert.equal(contracts.feedSidebarResponseSchema.safeParse(anonymousDaily).success, false);

  for (const mutate of [
    (value) => { value.peopleToFollow.items[0].user.email = 'private@example.com'; },
    (value) => { value.peopleToFollow.items[0].viewer.internal = true; },
    (value) => { value.lOfTheDay.item.l.author.email = 'private@example.com'; },
    (value) => { value.topLs.internal = true; },
  ]) {
    const leaked = structuredClone(payload);
    mutate(leaked);
    assert.equal(
      contracts.feedSidebarResponseSchema.safeParse(leaked).success,
      false,
      'sidebar response rejects unknown nested fields instead of stripping them',
    );
  }
});
