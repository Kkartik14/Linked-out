'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { cpSync, mkdtempSync, mkdirSync, readdirSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const { createPrismaClient } = require('../packages/db/dist');

const ROOT = resolve(__dirname, '..');
const MIGRATIONS = resolve(ROOT, 'packages/db/prisma/migrations');
const PRISMA_BIN = resolve(ROOT, 'packages/db/node_modules/.bin/prisma');
const FIRST_1_1_4_MIGRATION = '20260723100000_remove_collections';
const FINAL_1_1_4_MIGRATIONS = [
  FIRST_1_1_4_MIGRATION,
  '20260723110000_reduce_l_types',
];
const UPGRADE_DB_NAME = 'linkedout_test_1_1_4_upgrade';

const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const CHECKPOINT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
const LESSON_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAX';
const REACTION_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAY';
const COMMENT_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAZ';
const COLLECTION_ID = '01ARZ3NDEKTSV4RRFFQ69G5FB0';
const CHECKPOINT_CREATED_AT = '2026-01-02T03:04:05.000Z';
const LESSON_CREATED_AT = '2026-02-03T04:05:06.000Z';

function refuse(message) {
  throw new Error(`1.1.4 migration rehearsal refused: ${message}`);
}

function checkedBaseUrl() {
  const raw =
    process.env.TEST_DATABASE_URL ??
    'postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public';
  const url = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    refuse('TEST_DATABASE_URL must target loopback');
  }
  if (decodeURIComponent(url.pathname.slice(1)) !== 'linkedout_test') {
    refuse('TEST_DATABASE_URL must target the guarded linkedout_test database');
  }
  return url;
}

function deploy(schemaPath, databaseUrl) {
  const result = spawnSync(PRISMA_BIN, ['migrate', 'deploy', '--schema', schemaPath], {
    cwd: resolve(ROOT, 'packages/db'),
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl },
    encoding: 'utf8',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy failed:\n${result.stdout}\n${result.stderr}`);
  }
}

function buildMigrationFixture() {
  const tempRoot = mkdtempSync(join(tmpdir(), 'linkedout-1.1.4-migrations-'));
  const prismaDir = join(tempRoot, 'prisma');
  const migrationDir = join(prismaDir, 'migrations');
  mkdirSync(migrationDir, { recursive: true });
  cpSync(resolve(ROOT, 'packages/db/prisma/schema.prisma'), join(prismaDir, 'schema.prisma'));
  cpSync(join(MIGRATIONS, 'migration_lock.toml'), join(migrationDir, 'migration_lock.toml'));

  for (const entry of readdirSync(MIGRATIONS, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name < FIRST_1_1_4_MIGRATION) {
      cpSync(join(MIGRATIONS, entry.name), join(migrationDir, entry.name), { recursive: true });
    }
  }

  return {
    tempRoot,
    schemaPath: join(prismaDir, 'schema.prisma'),
    addFinalMigrations() {
      for (const name of FINAL_1_1_4_MIGRATIONS) {
        cpSync(join(MIGRATIONS, name), join(migrationDir, name), { recursive: true });
      }
    },
  };
}

async function seedPreviousSchema(db) {
  await db.$executeRawUnsafe(
    `INSERT INTO "User"
      ("id", "username", "name", "storiesShared", "lessonsShared", "lsShared",
       "collectionsCreated", "createdAt", "updatedAt")
     VALUES ($1, 'migration_user', 'Migration User', 4, 2, 9, 1, NOW(), NOW())`,
    USER_ID,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "L" ("id", "authorId", "title", "story", "type", "createdAt", "updatedAt")
     VALUES
       ($1, $3, 'Checkpoint', 'Preserve me', 'CHECKPOINT', $4::timestamptz, $4::timestamptz),
       ($2, $3, 'Lesson', 'Preserve me too', 'LESSON', $5::timestamptz, $5::timestamptz)`,
    CHECKPOINT_ID,
    LESSON_ID,
    USER_ID,
    CHECKPOINT_CREATED_AT,
    LESSON_CREATED_AT,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "Reaction" ("id", "type", "userId", "lId", "createdAt")
     VALUES ($1, 'RESPECT', $2, $3, NOW())`,
    REACTION_ID,
    USER_ID,
    CHECKPOINT_ID,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "Comment" ("id", "body", "authorId", "lId", "createdAt", "updatedAt")
     VALUES ($1, 'Still attached', $2, $3, NOW(), NOW())`,
    COMMENT_ID,
    USER_ID,
    LESSON_ID,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "Collection" ("id", "ownerId", "title", "slug", "createdAt")
     VALUES ($1, $2, 'Retired collection', 'retired-collection', NOW())`,
    COLLECTION_ID,
    USER_ID,
  );
  await db.$executeRawUnsafe(
    `INSERT INTO "CollectionL" ("collectionId", "lId", "position") VALUES ($1, $2, 0)`,
    COLLECTION_ID,
    CHECKPOINT_ID,
  );
}

async function assertUpgradedData(db) {
  const ls = await db.$queryRawUnsafe(
    `SELECT "id", "type"::text AS "type", "createdAt"
       FROM "L" WHERE "id" IN ($1, $2) ORDER BY "id"`,
    CHECKPOINT_ID,
    LESSON_ID,
  );
  assert.deepEqual(
    ls.map((l) => ({ id: l.id, type: l.type, createdAt: l.createdAt.toISOString() })),
    [
      { id: CHECKPOINT_ID, type: 'L', createdAt: CHECKPOINT_CREATED_AT },
      { id: LESSON_ID, type: 'L', createdAt: LESSON_CREATED_AT },
    ],
    'retired L rows keep their ids and timestamps while becoming L',
  );

  const [relations] = await db.$queryRawUnsafe(
    `SELECT
       (SELECT count(*)::int FROM "Reaction" WHERE "id" = $1) AS "reactions",
       (SELECT count(*)::int FROM "Comment" WHERE "id" = $2) AS "comments"`,
    REACTION_ID,
    COMMENT_ID,
  );
  assert.deepEqual(relations, { reactions: 1, comments: 1 });

  const [reputation] = await db.$queryRawUnsafe(
    `SELECT "storiesShared", "lsShared" FROM "User" WHERE "id" = $1`,
    USER_ID,
  );
  assert.deepEqual(reputation, { storiesShared: 4, lsShared: 9 });

  const [removed] = await db.$queryRawUnsafe(
    `SELECT
       to_regclass('"Collection"')::text AS "collectionTable",
       to_regclass('"CollectionL"')::text AS "collectionLTable",
       to_regclass('"L_authorId_createdAt_idx"')::text AS "journeyIndex",
       EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'User'
            AND column_name IN ('collectionsCreated', 'lessonsShared')
       ) AS "retiredUserColumns"`,
  );
  assert.deepEqual(removed, {
    collectionTable: null,
    collectionLTable: null,
    journeyIndex: null,
    retiredUserColumns: false,
  });
}

async function main() {
  if (process.env.ALLOW_TEST_DB_RESET !== '1') refuse('ALLOW_TEST_DB_RESET=1 is required');

  const base = checkedBaseUrl();
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  adminUrl.search = '';
  const upgradeUrl = new URL(base);
  upgradeUrl.pathname = `/${UPGRADE_DB_NAME}`;

  const fixture = buildMigrationFixture();
  const admin = createPrismaClient({ datasourceUrl: adminUrl.toString() });
  let upgradeDb;
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${UPGRADE_DB_NAME}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${UPGRADE_DB_NAME}"`);

    deploy(fixture.schemaPath, upgradeUrl.toString());
    upgradeDb = createPrismaClient({ datasourceUrl: upgradeUrl.toString() });
    await seedPreviousSchema(upgradeDb);
    await upgradeDb.$disconnect();
    upgradeDb = undefined;

    fixture.addFinalMigrations();
    deploy(fixture.schemaPath, upgradeUrl.toString());
    upgradeDb = createPrismaClient({ datasourceUrl: upgradeUrl.toString() });
    await assertUpgradedData(upgradeDb);
    console.log('1.1.4 migrations preserve representative legacy data and remove retired storage.');
  } finally {
    await upgradeDb?.$disconnect();
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${UPGRADE_DB_NAME}" WITH (FORCE)`);
    await admin.$disconnect();
    rmSync(fixture.tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
