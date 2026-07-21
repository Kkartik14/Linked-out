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

test('HELPFUL reaction plans preserve counters, popularity, and folded notification behavior', () => {
  assert.deepEqual(planReactionAdd(ACTOR_ID, L_ID, 'HELPFUL', AUTHOR_ID), {
    reaction: { userId: ACTOR_ID, lId: L_ID, type: 'HELPFUL' },
    lCounters: { reactionCount: 1, helpfulCount: 1, popularityScore: 3 },
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
    notification: {
      action: 'delete_fold_if_no_external_reaction',
      dedupeKey: `${AUTHOR_ID}:${L_ID}:HELPED`,
      recipientId: AUTHOR_ID,
      lId: L_ID,
      reactionType: 'HELPFUL',
    },
  });
});

test('SAVED and self-reaction plans cannot affect popularity or notifications', () => {
  const saved = planReactionAdd(ACTOR_ID, L_ID, 'SAVED', AUTHOR_ID);
  assert.deepEqual(saved.lCounters, { reactionCount: 1, savedCount: 1 });
  assert.equal(saved.notification, null);

  const selfHelpful = planReactionAdd(ACTOR_ID, L_ID, 'HELPFUL', ACTOR_ID);
  assert.equal(selfHelpful.notification, null);
});

test('comment plans declare popularity and notification effects outside persistence', () => {
  assert.deepEqual(
    planCommentCreate({
      authorId: ACTOR_ID,
      lId: L_ID,
      notificationRecipientIds: [AUTHOR_ID],
      parentId: null,
      body: 'This helped.',
    }),
    {
      comment: { authorId: ACTOR_ID, lId: L_ID, parentId: null, body: 'This helped.' },
      lCounters: { commentCount: 1, popularityScore: 2 },
      notifications: [
        {
          type: 'COMMENT',
          recipientId: AUTHOR_ID,
          actorId: ACTOR_ID,
          lId: L_ID,
          dedupeKey: null,
        },
      ],
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
    notificationRecipientIds: [ACTOR_ID],
    parentId: null,
    body: 'A note to self.',
  });
  assert.deepEqual(plan.notifications, []);
});

test('reply notifications preserve the L author and add the parent commenter without duplicates', () => {
  const parentAuthor = '01ERZ3NDEKTSV4RRFFQ69G5FAV';
  const plan = planCommentCreate({
    authorId: ACTOR_ID,
    lId: L_ID,
    notificationRecipientIds: [AUTHOR_ID, parentAuthor, AUTHOR_ID, ACTOR_ID],
    parentId: '01FRZ3NDEKTSV4RRFFQ69G5FAV',
    body: 'Replying.',
  });
  assert.deepEqual(
    plan.notifications.map((notification) => notification.recipientId),
    [AUTHOR_ID, parentAuthor],
  );
});

test('L deletion declares only type-derived reputation effects before persistence', () => {
  assert.deepEqual(planLDelete(), {
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
  });
});
