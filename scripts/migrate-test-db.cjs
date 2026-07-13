'use strict';

/**
 * TEST-01 migrate wrapper — makes the migration target provably the same DB the guard verified.
 *
 * Prisma migrations read `directUrl = env("DIRECT_URL")` (falling back to DATABASE_URL), which
 * can differ from the guard's TEST_DATABASE_URL. This wrapper:
 *   1. selects TEST_DATABASE_URL as the one canonical target,
 *   2. rejects any disagreement among TEST_DATABASE_URL / DATABASE_URL / DIRECT_URL,
 *   3. verifies that canonical target + its pre-existing fingerprinted marker (verify-only),
 *   4. runs `prisma migrate deploy` with BOTH datasource vars forced to the verified URL.
 */

const { spawnSync } = require('node:child_process');

// Capture the datasource env BEFORE the generated Prisma client is required: requiring it loads
// packages/db/.env, which would otherwise inject the DEV DATABASE_URL/DIRECT_URL and spuriously
// trip the disagreement check. An explicit value set by the caller is still captured here.
const AMBIENT = { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };
const canonical = process.env.TEST_DATABASE_URL ?? null;

const { PrismaClient } = require('../packages/db/generated/client');
const { assertResettableTestDb, prismaAdapter } = require('./db-safety-guard.cjs');

function disagrees(value) {
  return typeof value === 'string' && value.length > 0 && value !== canonical;
}

(async () => {
  if (!canonical) {
    console.error('migrate-test-db: TEST_DATABASE_URL must be set (the canonical migration target).');
    process.exit(1);
  }
  for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
    if (disagrees(AMBIENT[name])) {
      console.error(
        `migrate-test-db: ${name} disagrees with TEST_DATABASE_URL — refusing to migrate a different target than the one verified.`,
      );
      process.exit(1);
    }
  }

  const prisma = new PrismaClient({ datasources: { db: { url: canonical } } });
  try {
    await prisma.$connect();
    await assertResettableTestDb(prismaAdapter(prisma), { url: canonical });
  } catch (err) {
    console.error(`migrate-test-db: ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }

  // Force BOTH datasource vars to the verified URL. dotenv (used by the Prisma CLI) does not
  // override already-set env vars, so these win over packages/db/.env in the child.
  const result = spawnSync(
    'pnpm',
    ['--filter', '@linkedout/db', 'exec', 'prisma', 'migrate', 'deploy'],
    { stdio: 'inherit', env: { ...process.env, DATABASE_URL: canonical, DIRECT_URL: canonical } },
  );
  process.exit(result.status ?? 1);
})();
