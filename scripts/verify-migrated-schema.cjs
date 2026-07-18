'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const { createPrismaClient } = require('../packages/db/dist');

/**
 * Two independent checks, because they catch different mistakes:
 *
 *  1. `schema.prisma` still agrees with the migrations. Without this, editing the model and
 *     forgetting the migration ships silently: `prisma generate` reads the schema, so the client
 *     and the typecheck both believe the column exists, while the deployed database has never
 *     heard of it. Only a test that happens to touch the column notices.
 *  2. The objects Prisma cannot express — a generated column, GIN/partial indexes, CHECK
 *     constraints, the follow-counter functions and triggers — are actually present. `migrate
 *     diff` is blind to these, so nothing else would catch a migration that dropped one.
 */

function refuse(message) {
  throw new Error(`Schema verification refused: ${message}`);
}

/**
 * The statements `migrate diff` always emits for objects Prisma's datamodel cannot represent.
 * `L_search_idx` is a GIN index over a generated tsvector column, and `searchVector` is a
 * generated column Prisma models as a plain field with a default — so Prisma "corrects" both on
 * every diff. These two lines are the entire legitimate residue: anything else in the diff is a
 * real disagreement between schema.prisma and the migrations.
 */
const EXPECTED_DIFF_RESIDUE = [
  'DROP INDEX "L_search_idx";',
  'ALTER TABLE "L" ALTER COLUMN "searchVector" DROP DEFAULT;',
];

/** SQL-only objects that no `migrate diff` can see. Each is load-bearing; see the migration. */
const SQL_ONLY = {
  // L_search_idx / User_search_trgm_idx back search; Comment_lId_id_top_level_idx backs comment
  // pagination; Reaction_sidebar_active_* is the partial+INCLUDE index the sidebar ranking
  // query depends on — without it that query degrades to a heap scan.
  indexes: [
    'Comment_lId_id_top_level_idx',
    'L_search_idx',
    'Reaction_sidebar_active_createdAt_lId_userId_idx',
    'User_search_trgm_idx',
  ],
  // The counter triggers keep these true; the CHECKs are what turn a counter bug into a failed
  // write instead of a negative follower count served to users.
  checks: [
    'User_followerCount_nonnegative',
    'User_followingCount_nonnegative',
    'User_username_nonempty',
  ],
  functions: ['linkedout_lock_follow_endpoints', 'linkedout_maintain_follow_counters'],
  triggers: ['Follow_lock_counter_endpoints', 'Follow_maintain_counters'],
  extensions: ['pg_trgm'],
};

/** Drops `-- comment` lines and blanks so formatting churn is not treated as drift. */
function significantStatements(script) {
  return script
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('--'));
}

function migrationsVsSchema(prismaBin, shadowUrl) {
  const diff = spawnSync(
    prismaBin,
    [
      'migrate',
      'diff',
      '--from-migrations',
      resolve(__dirname, '../packages/db/prisma/migrations'),
      '--to-schema-datamodel',
      resolve(__dirname, '../packages/db/prisma/schema.prisma'),
      '--shadow-database-url',
      shadowUrl,
      '--script',
    ],
    { encoding: 'utf8' },
  );
  if (diff.error) throw diff.error;
  if (diff.status !== 0) {
    throw new Error(`prisma migrate diff failed:\n${diff.stderr}`);
  }

  const actual = significantStatements(diff.stdout);
  const unexpected = actual.filter((line) => !EXPECTED_DIFF_RESIDUE.includes(line));
  if (unexpected.length > 0) {
    throw new Error(
      'schema.prisma and the migrations disagree. Either a model change has no migration ' +
        '(run `pnpm migrate`), or a migration changed something the model does not reflect.\n' +
        `Unexpected diff statements:\n  ${unexpected.join('\n  ')}`,
    );
  }
  // If the residue disappears, Prisma changed how it renders these and the allowlist is stale —
  // silently accepting that would let the allowlist grow to hide real drift later.
  assert.deepEqual(
    actual.slice().sort(),
    EXPECTED_DIFF_RESIDUE.slice().sort(),
    'the expected migrate-diff residue changed; re-derive EXPECTED_DIFF_RESIDUE before editing it',
  );
}

async function sqlOnlyObjects(db) {
  const [objects] = await db.$queryRawUnsafe(
    `
      SELECT
        EXISTS (
          SELECT 1 FROM pg_attribute
          WHERE attrelid = '"L"'::regclass AND attname = 'searchVector' AND attgenerated = 's'
        ) AS generated_search,
        (SELECT array_agg(indexname::text ORDER BY indexname)
           FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)) AS indexes,
        (SELECT array_agg(conname::text ORDER BY conname)
           FROM pg_constraint WHERE contype = 'c' AND conname = ANY($2)) AS checks,
        (SELECT array_agg(proname::text ORDER BY proname)
           FROM pg_proc WHERE proname = ANY($3)) AS functions,
        (SELECT array_agg(tgname::text ORDER BY tgname)
           FROM pg_trigger WHERE NOT tgisinternal AND tgname = ANY($4)) AS triggers,
        (SELECT array_agg(extname::text ORDER BY extname)
           FROM pg_extension WHERE extname = ANY($5)) AS extensions
    `,
    SQL_ONLY.indexes,
    SQL_ONLY.checks,
    SQL_ONLY.functions,
    SQL_ONLY.triggers,
    SQL_ONLY.extensions,
  );

  // Compared by name, not by count: a count check passes when one object is dropped and an
  // unrelated one is added, and it cannot say which is missing.
  assert.ok(objects.generated_search, 'L.searchVector must be a stored generated column');
  for (const [kind, expected] of Object.entries(SQL_ONLY)) {
    assert.deepEqual(
      objects[kind] ?? [],
      expected.slice().sort(),
      `missing SQL-only ${kind} — a migration dropped an object Prisma cannot recreate`,
    );
  }
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

  const prismaBin = resolve(__dirname, '../packages/db/node_modules/.bin/prisma');

  migrationsVsSchema(prismaBin, shadow.toString());

  // The migrated database really is at migration head. Redundant right after `migrate deploy`,
  // but this script also runs standalone against a database that may have drifted by hand.
  const applied = spawnSync(
    prismaBin,
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
  if (applied.error) throw applied.error;
  if (applied.status !== 0) process.exit(applied.status ?? 1);

  const db = createPrismaClient({ datasourceUrl: target.toString() });
  try {
    await sqlOnlyObjects(db);
  } finally {
    await db.$disconnect();
  }
  console.log('schema.prisma matches the migrations, and all SQL-only objects are present.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
