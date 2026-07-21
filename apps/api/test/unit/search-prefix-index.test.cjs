'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../packages/db/prisma/migrations/20260721120000_add_l_prefix_search_vector/migration.sql',
  ),
  'utf8',
);
const schemaVerifier = readFileSync(
  resolve(__dirname, '../../../../scripts/verify-migrated-schema.cjs'),
  'utf8',
);

test('L prefix search preserves source lexemes, weights title above story, and is GIN indexed', () => {
  assert.match(migration, /setweight\(to_tsvector\('simple',[\s\S]*"title"[\s\S]*'A'\)/);
  assert.match(migration, /setweight\(to_tsvector\('simple',[\s\S]*"story"[\s\S]*'B'\)/);
  assert.match(
    migration,
    /CREATE INDEX "L_search_prefix_idx" ON "L" USING GIN \("searchPrefixVector"\)/,
  );
});

test('schema parity registers every SQL-only prefix-search object', () => {
  assert.match(schemaVerifier, /'DROP INDEX "L_search_prefix_idx";'/);
  assert.match(schemaVerifier, /'L_search_prefix_idx'/);
  assert.match(
    schemaVerifier,
    /generatedColumns: \['searchPrefixVector', 'searchVector'\]/,
  );
  assert.match(schemaVerifier, /attname = ANY\(\$1\)[\s\S]*attgenerated = 's'/);
});
