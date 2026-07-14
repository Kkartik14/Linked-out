'use strict';

const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createPrismaClient } = require('../packages/db/dist');

function refuse(message) {
  throw new Error(`Schema verification refused: ${message}`);
}

async function main() {
  if (process.env.ALLOW_TEST_DB_RESET !== '1') refuse('ALLOW_TEST_DB_RESET=1 is required');
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) refuse('TEST_DATABASE_URL is required');
  const target = new URL(raw);
  if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname)) refuse('target must be loopback');
  const targetName = decodeURIComponent(target.pathname.slice(1));
  if (targetName !== 'linkedout_test') refuse(`unexpected target ${targetName}`);

  const shadowName = 'linkedout_test_shadow';
  const admin = new URL(target);
  admin.pathname = '/postgres';
  admin.search = '';
  const shadow = new URL(target);
  shadow.pathname = `/${shadowName}`;

  const adminDb = createPrismaClient({ datasourceUrl: admin.toString() });
  try {
    const exists = await adminDb.$queryRawUnsafe(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      shadowName,
    );
    if (exists.length === 0) await adminDb.$executeRawUnsafe(`CREATE DATABASE "${shadowName}"`);
  } finally {
    await adminDb.$disconnect();
  }

  const prisma = resolve(__dirname, '../packages/db/node_modules/.bin/prisma');
  const diff = spawnSync(
    prisma,
    [
      'migrate',
      'diff',
      '--from-migrations',
      resolve(__dirname, '../packages/db/prisma/migrations'),
      '--to-url',
      target.toString(),
      '--shadow-database-url',
      shadow.toString(),
      '--exit-code',
    ],
    { stdio: 'inherit' },
  );
  if (diff.error) throw diff.error;
  if (diff.status !== 0) process.exit(diff.status ?? 1);

  const db = createPrismaClient({ datasourceUrl: target.toString() });
  try {
    const [objects] = await db.$queryRawUnsafe(`
      SELECT
        EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = '"L"'::regclass AND attname = 'searchVector' AND attgenerated = 's') AS generated_search,
        (SELECT count(*)::int FROM pg_indexes WHERE indexname IN ('L_search_idx', 'User_search_trgm_idx', 'Comment_lId_id_top_level_idx')) AS indexes,
        (SELECT count(*)::int FROM pg_proc WHERE proname IN ('linkedout_lock_follow_endpoints', 'linkedout_maintain_follow_counters')) AS functions,
        (SELECT count(*)::int FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('Follow_lock_counter_endpoints', 'Follow_maintain_counters')) AS triggers
    `);
    if (!objects.generated_search || objects.indexes !== 3 || objects.functions !== 2 || objects.triggers !== 2) {
      throw new Error(`SQL-only schema objects are incomplete: ${JSON.stringify(objects)}`);
    }
  } finally {
    await db.$disconnect();
  }
  console.log('Schema matches migrations and all SQL-only objects are present.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
