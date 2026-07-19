'use strict';

const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const ROOT = resolve(__dirname, '../../../..');
const SCHEMA = readFileSync(resolve(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
const MIGRATIONS_ROOT = resolve(ROOT, 'packages/db/prisma/migrations');
const MIGRATION = readdirSync(MIGRATIONS_ROOT)
  .filter((name) => name.startsWith('2026072012'))
  .sort()
  .map((name) => readFileSync(resolve(MIGRATIONS_ROOT, name, 'migration.sql'), 'utf8'))
  .join('\n');

test('keyset index declarations match equality predicates and complete ordering', () => {
  assert.match(SCHEMA, /@@index\(\[authorId, id\(sort: Desc\)\]\)/);
  assert.match(SCHEMA, /@@index\(\[userId, type, id\(sort: Desc\)\]\)/);
  assert.match(SCHEMA, /@@index\(\[ownerId, id\(sort: Desc\)\]\)/);
  assert.match(SCHEMA, /@@index\(\[recipientId, createdAt\(sort: Desc\), id\(sort: Desc\)\]\)/);

  assert.match(
    MIGRATION,
    /CREATE INDEX CONCURRENTLY "L_authorId_id_idx" ON "L"\("authorId", "id" DESC\)/,
  );
  assert.match(
    MIGRATION,
    /CREATE INDEX CONCURRENTLY "Reaction_userId_type_id_idx"\s+ON "Reaction"\("userId", "type", "id" DESC\)/,
  );
  assert.match(
    MIGRATION,
    /CREATE INDEX CONCURRENTLY "Collection_ownerId_id_idx"\s+ON "Collection"\("ownerId", "id" DESC\)/,
  );
  assert.match(
    MIGRATION,
    /CREATE INDEX CONCURRENTLY "Notification_recipientId_createdAt_id_idx"\s+ON "Notification"\("recipientId", "createdAt" DESC, "id" DESC\)/,
  );
});

test('new composites replace redundant prefix indexes', () => {
  const replacements = [
    ['Reaction_userId_type_id_idx', 'Reaction_userId_type_idx'],
    ['Collection_ownerId_id_idx', 'Collection_ownerId_idx'],
    ['Notification_recipientId_createdAt_id_idx', 'Notification_recipientId_createdAt_idx'],
  ];
  for (const [replacement, previous] of replacements) {
    assert.match(MIGRATION, new RegExp(`DROP INDEX CONCURRENTLY IF EXISTS "${previous}"`));
    assert.ok(
      MIGRATION.indexOf(`CREATE INDEX CONCURRENTLY "${replacement}"`) <
        MIGRATION.indexOf(`DROP INDEX CONCURRENTLY IF EXISTS "${previous}"`),
      `${replacement} must be created before ${previous} is removed`,
    );
  }
  assert.doesNotMatch(SCHEMA, /@@index\(\[userId, type\]\)/);
  assert.doesNotMatch(SCHEMA, /@@index\(\[ownerId\]\)/);
  assert.doesNotMatch(SCHEMA, /@@index\(\[recipientId, createdAt\(sort: Desc\)\]\)/);
});
