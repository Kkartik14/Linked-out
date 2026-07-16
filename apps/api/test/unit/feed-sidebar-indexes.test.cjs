'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/db/prisma/migrations/20260717014000_feed_sidebar_covering_index/migration.sql',
  ),
  'utf8',
);
const repository = readFileSync(
  resolve(__dirname, '../../src/modules/feed-sidebar/feed-sidebar.repository.ts'),
  'utf8',
);

test('sidebar reaction indexes exclude saved-only traffic and cover helpful tie-breaks', () => {
  assert.match(
    migration,
    /ON "Reaction"\("createdAt", "lId", "userId"\) INCLUDE \("type"\)\s+WHERE "type" <> 'SAVED'/,
  );
  assert.match(migration, /DROP INDEX IF EXISTS "Reaction_sidebar_helpful_createdAt_lId_userId_idx"/);
  assert.match(repository, /reaction\."type" <> 'SAVED'/);
  assert.match(repository, /reaction\."type" = 'HELPFUL'/);
});
