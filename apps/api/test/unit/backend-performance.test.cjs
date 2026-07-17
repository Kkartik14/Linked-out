'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

require('reflect-metadata');

const {
  CommentsRepository,
} = require('../../dist/modules/comments/comments.repository');
const {
  toNotification,
} = require('../../dist/modules/notifications/notifications.mapper');
const {
  NotificationsRepository,
} = require('../../dist/modules/notifications/notifications.repository');
const {
  UsersRepository,
} = require('../../dist/modules/users/users.repository');
const {
  ReactionsRepository,
} = require('../../dist/modules/reactions/reactions.repository');

const RECIPIENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const L_ID = '01BRZ3NDEKTSV4RRFFQ69G5FAV';
const COMMENT_ID = '01CRZ3NDEKTSV4RRFFQ69G5FAV';
const NOW = new Date('2026-01-02T03:04:05.000Z');

test('repositories do not translate HTTP errors or accept business-policy callbacks', () => {
  const repositoryPaths = [
    'modules/ls/ls.repository.ts',
    'modules/notifications/notifications.repository.ts',
    'modules/reactions/reactions.repository.ts',
  ];
  for (const path of repositoryPaths) {
    const source = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
    assert.doesNotMatch(source, /\bAppErrors\b/, `${path} must return persistence/domain state`);
  }

  const lsRepository = readFileSync(
    resolve(__dirname, '../../src/modules/ls/ls.repository.ts'),
    'utf8',
  );
  assert.doesNotMatch(
    lsRepository,
    /\b(?:BuildUpdateData|TypeChangeDelta|DeleteReputation|buildData|typeChangeDelta|deleteReputation)\b/,
    'LsRepository must receive declarative write plans, not execute service callbacks',
  );
});

test('unread notification indicator performs a capped existence query', async () => {
  let findManyArgs;
  const repo = new NotificationsRepository({
    db: {
      notification: {
        findMany: async (args) => {
          findManyArgs = args;
          return Array.from({ length: 10 }, (_, index) => ({ id: String(index) }));
        },
      },
    },
  });

  const count = await repo.unreadCount(RECIPIENT_ID);

  assert.deepEqual(findManyArgs, {
    where: { recipientId: RECIPIENT_ID, readAt: null },
    select: { id: true },
    take: 10,
  });
  assert.equal(count, 10);
});

test('the repository architecture pins the same Node major locally and in CI', () => {
  const root = resolve(__dirname, '../../../..');
  const rootPackage = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const webPackage = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8'));
  const nodeVersion = readFileSync(resolve(root, '.node-version'), 'utf8').trim();
  const ciWorkflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');

  assert.equal(nodeVersion, '22');
  assert.equal(rootPackage.engines.node, '22.x');
  assert.equal(webPackage.engines.node, '22.x');
  assert.doesNotMatch(ciWorkflow, /\bNODE_VERSION\s*:/);
  assert.doesNotMatch(ciWorkflow, /^\s+node-version:\s/m);

  // Derived from the workflow rather than hardcoded: the claim is "every setup-node step reads
  // the pin", and a literal count restates that as a number that has to be bumped whenever a
  // job is added — failing for the wrong reason, and inviting the bump to be made without
  // checking the new step actually reads the pin.
  const setupNodeSteps = (ciWorkflow.match(/^\s+-\s+uses:\s*actions\/setup-node@/gm) ?? []).length;
  assert.ok(setupNodeSteps > 0, 'the workflow sets Node up at all');
  assert.equal(
    (ciWorkflow.match(/^\s+node-version-file:\s*\.node-version\s*$/gm) ?? []).length,
    setupNodeSteps,
    'every setup-node step reads the repository Node pin',
  );
});

test('notification list selects counters and only the recipient self-reactions', async () => {
  let findManyArgs;
  const repo = new NotificationsRepository({
    db: {
      notification: {
        findMany: async (args) => {
          findManyArgs = args;
          return [];
        },
      },
    },
  });

  await repo.listByRecipient(RECIPIENT_ID, 20, undefined);

  const lSelect = findManyArgs.include.l.select;
  assert.equal(lSelect.beenThereCount, true);
  assert.equal(lSelect.helpfulCount, true);
  assert.deepEqual(lSelect.reactions.where, {
    userId: RECIPIENT_ID,
    type: { in: ['BEEN_THERE', 'HELPFUL'] },
  });
  assert.deepEqual(lSelect.reactions.select, { type: true });
});

test('notification copy uses denormalized counters while excluding the author self-reaction', () => {
  const notification = toNotification({
    id: '01DRZ3NDEKTSV4RRFFQ69G5FAV',
    type: 'RELATED',
    recipientId: RECIPIENT_ID,
    actorId: null,
    lId: L_ID,
    dedupeKey: null,
    readAt: null,
    createdAt: NOW,
    actor: null,
    l: {
      id: L_ID,
      title: 'A story',
      beenThereCount: 500,
      helpfulCount: 0,
      reactions: [{ type: 'BEEN_THERE' }],
    },
  });

  assert.equal(notification.message, '499 builders related to your story.');
});

test('comment deletion decrements by one plus direct replies without full-L counts', async () => {
  let lUpdate;
  const tx = {
    $queryRaw: async () => [{ id: L_ID }],
    comment: {
      findUnique: async () => ({ lId: L_ID, _count: { replies: 2 } }),
      delete: async () => ({ id: COMMENT_ID }),
    },
    l: {
      update: async (args) => {
        lUpdate = args;
        return { id: L_ID };
      },
    },
  };
  const repo = new CommentsRepository({
    db: {
      $transaction: async (operation) => operation(tx),
    },
  });

  await repo.delete({
    commentId: COMMENT_ID,
    perDeletedCounters: { commentCount: -1, popularityScore: -2 },
  });

  assert.deepEqual(lUpdate.data, {
    commentCount: { decrement: 3 },
    popularityScore: { decrement: 6 },
  });
});

test('reaction repository executes a weightless counter plan without touching the score', async () => {
  let lUpdate;
  const tx = {
    reaction: { createMany: async () => ({ count: 1 }) },
    l: {
      update: async (args) => {
        lUpdate = args;
        return { id: L_ID };
      },
    },
  };
  const repo = new ReactionsRepository({
    db: { $transaction: async (operation) => operation(tx) },
  });

  await repo.add({
    reaction: { userId: RECIPIENT_ID, lId: L_ID, type: 'SAVED' },
    lCounters: { reactionCount: 1, savedCount: 1 },
    reputation: null,
    notification: null,
  });

  assert.deepEqual(lUpdate.data, {
    reactionCount: { increment: 1 },
    savedCount: { increment: 1 },
  });
  assert.equal(Object.hasOwn(lUpdate.data, 'popularityScore'), false);
});

test('profile and standalone follow counts read persisted User counters without relation counts', async () => {
  let profileArgs;
  let countArgs;
  const repo = new UsersRepository({
    db: {
      user: {
        findUnique: async (args) => {
          profileArgs = args;
          return null;
        },
        findUniqueOrThrow: async (args) => {
          countArgs = args;
          return { followerCount: 7, followingCount: 2 };
        },
      },
    },
  });

  await repo.findByUsername('kartik');
  const counts = await repo.counts(RECIPIENT_ID);

  assert.equal(profileArgs.select.followerCount, true);
  assert.equal(profileArgs.select.followingCount, true);
  assert.equal(Object.hasOwn(profileArgs.select, '_count'), false);
  assert.deepEqual(countArgs.select, { followerCount: true, followingCount: true });
  assert.deepEqual(counts, { followers: 7, following: 2 });
});

test('follow-counter migration backfills both graph directions and owns every edge change', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../../packages/db/prisma/migrations/20260714090000_follow_counters/migration.sql',
    ),
    'utf8',
  );

  assert.match(
    migration,
    /SET "followerCount" = source\."count"[\s\S]*SELECT "followingId" AS "userId"/,
  );
  assert.match(
    migration,
    /SET "followingCount" = source\."count"[\s\S]*SELECT "followerId" AS "userId"/,
  );
  assert.match(migration, /BEFORE INSERT OR DELETE ON "Follow"/);
  assert.match(migration, /AFTER INSERT OR DELETE ON "Follow"/);
  assert.match(migration, /BEGIN;[\s\S]*LOCK TABLE "Follow" IN SHARE ROW EXCLUSIVE MODE;/);
  assert.match(migration, /EXECUTE FUNCTION "linkedout_maintain_follow_counters"\(\);[\s\S]*COMMIT;/);
  assert.match(migration, /CHECK \("followerCount" >= 0\)/);
  assert.match(migration, /CHECK \("followingCount" >= 0\)/);
});
