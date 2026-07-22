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
    'packages/db/prisma/migrations/20260723100000_remove_collections/migration.sql',
  ),
  'utf8',
);

test('the current database model has no collection storage or counters', () => {
  assert.doesNotMatch(SCHEMA, /model Collection\b/);
  assert.doesNotMatch(SCHEMA, /model CollectionL\b/);
  assert.doesNotMatch(SCHEMA, /collectionsCreated/);
  assert.doesNotMatch(SCHEMA, /@@index\(\[authorId, createdAt\(sort: Desc\)\]\)/);
});

test('the forward migration removes collection storage and the retired journey index', () => {
  assert.match(MIGRATION, /DROP TABLE "CollectionL"/);
  assert.match(MIGRATION, /DROP TABLE "Collection"/);
  assert.match(MIGRATION, /ALTER TABLE "User" DROP COLUMN "collectionsCreated"/);
  assert.match(MIGRATION, /DROP INDEX "L_authorId_createdAt_idx"/);
});
