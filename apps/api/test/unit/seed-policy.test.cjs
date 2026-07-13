'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  COMMENT_POPULARITY_WEIGHT: SEED_COMMENT_POPULARITY_WEIGHT,
  REACTION_POPULARITY_WEIGHT: SEED_REACTION_POPULARITY_WEIGHT,
  helpfulReactionWhere,
  popularityScoreFor,
} = require('../../../../packages/db/prisma/seed-policy.cjs');
const {
  COMMENT_POPULARITY_WEIGHT,
  REACTION_POPULARITY_WEIGHT,
} = require('../../dist/modules/ls/popularity.policy');

test('the seed mirror cannot drift from the runtime popularity policy', () => {
  assert.deepEqual(SEED_REACTION_POPULARITY_WEIGHT, REACTION_POPULARITY_WEIGHT);
  assert.equal(SEED_COMMENT_POPULARITY_WEIGHT, COMMENT_POPULARITY_WEIGHT);
});

test('seed popularity reconstruction matches runtime per-type reaction weights', () => {
  const score = popularityScoreFor(
    [
      { type: 'BEEN_THERE', _count: 2 },
      { type: 'HELPFUL', _count: 3 },
      { type: 'RESPECT', _count: 5 },
      { type: 'PAIN', _count: 7 },
      { type: 'SAVED', _count: 11 },
    ],
    13,
  );

  assert.equal(score, 2 * 2 + 3 * 3 + 5 * 2 + 7 + 11 * 0 + 13 * 2);
});

test('seed buildersHelped reconstruction excludes self-HELPFUL reactions', () => {
  assert.deepEqual(helpfulReactionWhere('author-id'), {
    type: 'HELPFUL',
    userId: { not: 'author-id' },
    l: { authorId: 'author-id' },
  });
});
