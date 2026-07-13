'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const ROOT = resolve(__dirname, '../../../..');
const SCHEMA = readFileSync(resolve(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
const MIGRATION = readFileSync(
  resolve(
    ROOT,
    'packages/db/prisma/migrations/20260714100000_comment_pagination_indexes/migration.sql',
  ),
  'utf8',
);

test('comment pagination indexes match both keyset query predicates and ordering', () => {
  assert.match(
    SCHEMA,
    /model Comment[\s\S]*@@index\(\[parentId, id\]\)/,
    'reply pages need parentId equality followed by id cursor/order',
  );
  assert.doesNotMatch(
    SCHEMA,
    /model Comment[\s\S]*@@index\(\[parentId\]\)/,
    'the composite left-prefix replaces the redundant parentId-only index',
  );

  assert.match(
    MIGRATION,
    /CREATE INDEX "Comment_parentId_id_idx"\s+ON "Comment"\("parentId", "id"\)/,
  );
  assert.match(
    MIGRATION,
    /CREATE INDEX "Comment_lId_id_top_level_idx"\s+ON "Comment"\("lId", "id"\)\s+WHERE "parentId" IS NULL/,
    'top-level pages should not pay to index replies',
  );
  assert.match(MIGRATION, /DROP INDEX "Comment_parentId_idx"/);
});
