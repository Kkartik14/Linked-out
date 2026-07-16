'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/db/prisma/migrations/20260717013000_feed_sidebar_partial_indexes/migration.sql',
  ),
  'utf8',
);

test('sidebar reaction indexes exclude saved-only traffic and cover helpful tie-breaks', () => {
  assert.match(
    migration,
    /ON "Reaction"\("createdAt", "lId", "userId"\)\s+WHERE "type" <> 'SAVED'/,
  );
  assert.match(
    migration,
    /ON "Reaction"\("createdAt", "lId", "userId"\)\s+WHERE "type" = 'HELPFUL'/,
  );
});
