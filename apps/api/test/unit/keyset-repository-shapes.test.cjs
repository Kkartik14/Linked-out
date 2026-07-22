'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { LsRepository } = require('../../dist/modules/ls/ls.repository');
const {
  NotificationsRepository,
} = require('../../dist/modules/notifications/notifications.repository');

function capture() {
  let query;
  return {
    model: {
      findMany: async (value) => {
        query = value;
        return [];
      },
    },
    query: () => query,
  };
}

test('L author pages issue the query matched by L_authorId_id_idx', async () => {
  const probe = capture();
  const repo = new LsRepository({ db: { l: probe.model } });
  await repo.byAuthor({
    authorId: 'author',
    visibilities: ['PUBLIC'],
    includeAnonymous: false,
    limit: 20,
    cursorId: 'cursor',
  });

  assert.deepEqual(probe.query().where.authorId, 'author');
  assert.deepEqual(probe.query().where.id, { lt: 'cursor' });
  assert.deepEqual(probe.query().orderBy, { id: 'desc' });
  assert.equal(probe.query().take, 21);
});

test('saved pages issue the query matched by Reaction_userId_type_id_idx', async () => {
  const probe = capture();
  const repo = new LsRepository({ db: { reaction: probe.model } });
  await repo.savedByUser('viewer', 20, 'cursor');

  assert.equal(probe.query().where.userId, 'viewer');
  assert.equal(probe.query().where.type, 'SAVED');
  assert.deepEqual(probe.query().where.id, { lt: 'cursor' });
  assert.deepEqual(probe.query().orderBy, { id: 'desc' });
  assert.equal(probe.query().take, 21);
});

test('notification pages issue the query matched by the complete recipient keyset index', async () => {
  const probe = capture();
  const repo = new NotificationsRepository({ db: { notification: probe.model } });
  const createdAt = new Date('2026-07-20T12:00:00.000Z');
  await repo.listByRecipient('recipient', 10, { createdAt, id: 'cursor' });

  assert.equal(probe.query().where.recipientId, 'recipient');
  assert.deepEqual(probe.query().where.AND, [{
    OR: [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: 'cursor' } },
    ],
  }]);
  assert.deepEqual(probe.query().orderBy, [{ createdAt: 'desc' }, { id: 'desc' }]);
  assert.equal(probe.query().take, 11);
});
