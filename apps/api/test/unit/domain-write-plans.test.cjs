'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  planReactionAdd,
  planReactionRemove,
} = require('../../dist/modules/reactions/reactions.plan');
const {
  planCommentCreate,
  planCommentDelete,
} = require('../../dist/modules/comments/comments.plan');
const { planLDelete } = require('../../dist/modules/ls/ls.write-plan');

const ACTOR_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const AUTHOR_ID = '01BRZ3NDEKTSV4RRFFQ69G5FAV';
const L_ID = '01CRZ3NDEKTSV4RRFFQ69G5FAV';

test('HELPFUL reaction plans declare counters, reputation, and folded notification behavior', () => {
  assert.deepEqual(planReactionAdd(ACTOR_ID, L_ID, 'HELPFUL', AUTHOR_ID), {
    reaction: { userId: ACTOR_ID, lId: L_ID, type: 'HELPFUL' },
    lCounters: { reactionCount: 1, helpfulCount: 1, popularityScore: 3 },
    reputation: { userId: AUTHOR_ID, buildersHelped: 1 },
    notification: {
      action: 'upsert_folded',
      record: {
        type: 'HELPED',
        recipientId: AUTHOR_ID,
        actorId: ACTOR_ID,
        lId: L_ID,
        dedupeKey: `${AUTHOR_ID}:${L_ID}:HELPED`,
      },
    },
  });

  assert.deepEqual(planReactionRemove(ACTOR_ID, L_ID, 'HELPFUL', AUTHOR_ID), {
    reaction: { userId: ACTOR_ID, lId: L_ID, type: 'HELPFUL' },
    lCounters: { reactionCount: -1, helpfulCount: -1, popularityScore: -3 },
    reputation: { userId: AUTHOR_ID, buildersHelped: -1 },
    notification: {
      action: 'delete_fold_if_no_external_reaction',
      dedupeKey: `${AUTHOR_ID}:${L_ID}:HELPED`,
      recipientId: AUTHOR_ID,
      lId: L_ID,
      reactionType: 'HELPFUL',
    },
  });
});

test('SAVED and self-reaction plans cannot affect popularity, reputation, or notifications', () => {
  const saved = planReactionAdd(ACTOR_ID, L_ID, 'SAVED', AUTHOR_ID);
  assert.deepEqual(saved.lCounters, { reactionCount: 1, savedCount: 1 });
  assert.equal(saved.reputation, null);
  assert.equal(saved.notification, null);

  const selfHelpful = planReactionAdd(ACTOR_ID, L_ID, 'HELPFUL', ACTOR_ID);
  assert.equal(selfHelpful.reputation, null);
  assert.equal(selfHelpful.notification, null);
});

test('comment plans declare popularity and notification effects outside persistence', () => {
  assert.deepEqual(
    planCommentCreate({
      authorId: ACTOR_ID,
      lId: L_ID,
      lAuthorId: AUTHOR_ID,
      parentId: null,
      body: 'This helped.',
    }),
    {
      comment: { authorId: ACTOR_ID, lId: L_ID, parentId: null, body: 'This helped.' },
      lCounters: { commentCount: 1, popularityScore: 2 },
      notification: {
        action: 'insert',
        record: {
          type: 'COMMENT',
          recipientId: AUTHOR_ID,
          actorId: ACTOR_ID,
          lId: L_ID,
          dedupeKey: null,
        },
      },
    },
  );

  assert.deepEqual(planCommentDelete('01DRZ3NDEKTSV4RRFFQ69G5FAV'), {
    commentId: '01DRZ3NDEKTSV4RRFFQ69G5FAV',
    perDeletedCounters: { commentCount: -1, popularityScore: -2 },
  });
});

test('commenting on your own L produces no notification plan', () => {
  const plan = planCommentCreate({
    authorId: ACTOR_ID,
    lId: L_ID,
    lAuthorId: ACTOR_ID,
    parentId: null,
    body: 'A note to self.',
  });
  assert.equal(plan.notification, null);
});

test('L deletion declares type and reaction-derived reputation effects before persistence', () => {
  assert.deepEqual(planLDelete(AUTHOR_ID), {
    reputationByType: {
      L: { lsShared: 1 },
      WIN: { lsShared: 1 },
      STORY: { lsShared: 1, storiesShared: 1 },
      SCAR: { lsShared: 1 },
      PLOT_TWIST: { lsShared: 1 },
      CHECKPOINT: { lsShared: 1 },
      LESSON: { lsShared: 1, lessonsShared: 1 },
      BATTLE: { lsShared: 1 },
    },
    countedReactionReputation: {
      reactionType: 'HELPFUL',
      excludeUserId: AUTHOR_ID,
      reputationField: 'buildersHelped',
      pointsPerReaction: 1,
    },
  });
});
