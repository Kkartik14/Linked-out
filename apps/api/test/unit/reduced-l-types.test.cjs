'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const ROOT = resolve(__dirname, '../../../..');
const SCHEMA = readFileSync(resolve(ROOT, 'packages/db/prisma/schema.prisma'), 'utf8');
const MIGRATION = readFileSync(
  resolve(ROOT, 'packages/db/prisma/migrations/20260723110000_reduce_l_types/migration.sql'),
  'utf8',
);

test('the current database model exposes only the six active L types', () => {
  const enumBody = SCHEMA.match(/enum LType \{([^}]*)\}/)?.[1] ?? '';
  assert.deepEqual(enumBody.match(/[A-Z_]+/g), [
    'L',
    'WIN',
    'STORY',
    'SCAR',
    'PLOT_TWIST',
    'BATTLE',
  ]);
  assert.doesNotMatch(SCHEMA, /lessonsShared/);
});

test('the forward migration preserves retired rows by reclassifying them as L', () => {
  assert.match(
    MIGRATION,
    /UPDATE "L" SET "type" = 'L' WHERE "type"::text IN \('CHECKPOINT', 'LESSON'\)/,
  );
  assert.ok(
    MIGRATION.indexOf('UPDATE "L"') < MIGRATION.indexOf('DROP TYPE "LType_old"'),
    'rows must be reclassified before the old enum is dropped',
  );
  assert.match(MIGRATION, /ALTER TABLE "User" DROP COLUMN "lessonsShared"/);
});
