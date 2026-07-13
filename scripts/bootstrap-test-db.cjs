'use strict';

/**
 * TEST-01 bootstrap — the DISTINCT, loopback-gated operation that plants the fingerprinted marker.
 *
 * Run once when the test database is created (local: right after `CREATE DATABASE` on the
 * Docker/loopback target; CI: against the ephemeral Postgres service), BEFORE migrating. It
 * refuses on a non-loopback URL and refuses to claim a populated, unmarked database. Routine
 * migrate/test execution only VERIFIES this marker (see scripts/migrate-test-db.cjs and the
 * harness), never creates it.
 */

const { PrismaClient } = require('../packages/db/generated/client');
const { bootstrapTestDatabase } = require('./db-safety-guard.cjs');

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;

(async () => {
  if (!url) {
    console.error('bootstrap-test-db: TEST_DATABASE_URL (or DATABASE_URL) must be set.');
    process.exit(1);
  }
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  try {
    await prisma.$connect();
    await bootstrapTestDatabase(prisma, { url });
    console.log('bootstrap-test-db: verified + fingerprinted marker planted (idempotent).');
  } catch (err) {
    console.error(`bootstrap-test-db: ${err && err.message ? err.message : String(err)}`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();
