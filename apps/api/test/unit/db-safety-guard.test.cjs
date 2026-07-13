'use strict';

// TEST-01 — proves the destructive-DB guard fails closed before any destructive SQL, and that
// marker creation (bootstrap) is loopback-gated and refuses to claim a populated/foreign DB.
// Pure unit test: mock adapters, no real database.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  declaredDbName,
  urlHostIsLoopback,
  verify,
  assertResettableTestDb,
  bootstrapTestDatabase,
  guardedReset,
  UnsafeTestDatabaseError,
  MARKER_TABLE,
  MARKER_SIGNATURE,
} = require('../../../../scripts/db-safety-guard.cjs');

const TEST_URL = 'postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public';
const DEV_URL = 'postgresql://linkedout:linkedout@localhost:5432/linkedout?schema=public';
const REMOTE_TEST_URL = 'postgresql://linkedout:linkedout@db.prod.example:5432/linkedout_test?schema=public';
const SYS = 'CLUSTER-1';

function mockAdapter({
  db = 'linkedout_test',
  sessionUser = 'linkedout',
  sysid = SYS,
  marker = { signature: MARKER_SIGNATURE, fingerprint: SYS },
  populated = false,
} = {}) {
  const calls = { reads: [], execs: [] };
  return {
    calls,
    read: async (sql) => {
      calls.reads.push(sql);
      if (sql.includes('current_database()')) return [{ db, session_user: sessionUser }];
      if (sql.includes('pg_control_system')) return [{ sysid }];
      // Table-agnostic "populated" probe (pg_class): any non-system object, not just "User".
      if (sql.includes('pg_class')) return [{ populated }];
      if (sql.includes('to_regclass') && sql.includes(MARKER_TABLE)) {
        return [{ table_exists: marker !== null }];
      }
      if (sql.includes('signature, fingerprint')) {
        return marker ? [{ signature: marker.signature, fingerprint: marker.fingerprint }] : [];
      }
      return [];
    },
    exec: async (sql) => {
      calls.execs.push(sql);
    },
  };
}

function mockPrisma(adapterOpts) {
  const adapter = mockAdapter(adapterOpts);
  return {
    adapter,
    $transaction: async (fn) =>
      fn({ $queryRawUnsafe: (sql) => adapter.read(sql), $executeRawUnsafe: (sql) => adapter.exec(sql) }),
  };
}

const SAVED = {};
const ENV_KEYS = [
  'ALLOW_TEST_DB_RESET',
  'TEST_DATABASE_URL',
  'DATABASE_URL',
  'TEST_DB_ALLOWED_NAMES',
  'TEST_DB_EXPECTED_SESSION_USER',
  'TEST_DB_ALLOW_NONLOOPBACK_BOOTSTRAP',
  'TEST_DB_NAME',
  'TEST_DB_EXPECTED_CLUSTER',
];
beforeEach(() => {
  for (const k of ENV_KEYS) {
    SAVED[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ALLOW_TEST_DB_RESET = '1';
  process.env.TEST_DB_EXPECTED_SESSION_USER = 'linkedout';
});
afterEach(() => {
  for (const [k, v] of Object.entries(SAVED)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function rejects(promise) {
  await assert.rejects(promise, (err) => err instanceof UnsafeTestDatabaseError);
}

// ── name / url helpers ─────────────────────────────────────────────────────────

test('declaredDbName extracts the path segment', () => {
  assert.equal(declaredDbName(TEST_URL), 'linkedout_test');
  assert.equal(declaredDbName(DEV_URL), 'linkedout');
  assert.equal(declaredDbName('not-a-url'), null);
});

test('urlHostIsLoopback accepts localhost/127.0.0.1/::1 and rejects remote hosts', () => {
  assert.equal(urlHostIsLoopback(TEST_URL), true);
  assert.equal(urlHostIsLoopback('postgresql://u@127.0.0.1:5432/linkedout_test'), true);
  assert.equal(urlHostIsLoopback('postgresql://u@[::1]:5432/linkedout_test'), true);
  assert.equal(urlHostIsLoopback(REMOTE_TEST_URL), false);
});

// ── verify (checks 1–5) ────────────────────────────────────────────────────────

test('verify fails closed without the opt-in flag', async () => {
  delete process.env.ALLOW_TEST_DB_RESET;
  await rejects(verify(mockAdapter(), { url: TEST_URL }));
});

test('verify fails closed without the mandatory session-role pin', async () => {
  delete process.env.TEST_DB_EXPECTED_SESSION_USER;
  await rejects(verify(mockAdapter(), { url: TEST_URL }));
});

test('verify rejects a dev name (exact allowlist, no regex)', async () => {
  await rejects(verify(mockAdapter({ db: 'linkedout' }), { url: DEV_URL }));
});

test('verify rejects a wrong session_user', async () => {
  await rejects(verify(mockAdapter({ sessionUser: 'postgres' }), { url: TEST_URL }));
});

test('verify rejects when TEST_DB_NAME differs from the URL database (same-cluster/different-name)', async () => {
  // setup created `fresh_tmp` but the URL targets `linkedout_test` → must fail closed.
  process.env.TEST_DB_NAME = 'fresh_tmp';
  process.env.TEST_DB_ALLOWED_NAMES = 'linkedout_test, fresh_tmp';
  await rejects(verify(mockAdapter(), { url: TEST_URL }));
});

// ── assert (adds check 6: marker + fingerprint) ─────────────────────────────────

test('assert rejects when the marker is absent', async () => {
  await rejects(assertResettableTestDb(mockAdapter({ marker: null }), { url: TEST_URL }));
});

test('assert rejects a stale marker signature', async () => {
  const adapter = mockAdapter({ marker: { signature: 'old:v1', fingerprint: SYS } });
  await rejects(assertResettableTestDb(adapter, { url: TEST_URL }));
});

test('assert rejects a marker whose fingerprint is from a different cluster', async () => {
  const adapter = mockAdapter({ sysid: 'CLUSTER-2', marker: { signature: MARKER_SIGNATURE, fingerprint: 'CLUSTER-1' } });
  await rejects(assertResettableTestDb(adapter, { url: TEST_URL }));
});

test('assert passes for a verified, fingerprint-matched marker', async () => {
  await assert.doesNotReject(assertResettableTestDb(mockAdapter(), { url: TEST_URL }));
});

// ── bootstrap (loopback-gated marker creation) ──────────────────────────────────

test('bootstrap plants a fingerprinted marker on a virgin loopback test DB', async () => {
  const prisma = mockPrisma({ marker: null, populated: false });
  await bootstrapTestDatabase(prisma, { url: TEST_URL });
  assert.equal(prisma.adapter.calls.execs.length, 3, 'CREATE SCHEMA + CREATE TABLE + INSERT');
  assert.ok(prisma.adapter.calls.execs.some((s) => s.includes(SYS)), 'stores the cluster fingerprint');
});

test('bootstrap refuses a non-loopback URL by default', async () => {
  const prisma = mockPrisma({ marker: null });
  await rejects(bootstrapTestDatabase(prisma, { url: REMOTE_TEST_URL }));
  assert.deepEqual(prisma.adapter.calls.execs, [], 'no marker created on a remote target');
});

test('bootstrap refuses a same-name DB on a different cluster (expected-cluster mismatch)', async () => {
  process.env.TEST_DB_EXPECTED_CLUSTER = 'CLUSTER-FROM-CREATE';
  const prisma = mockPrisma({ marker: null, sysid: 'A-DIFFERENT-CLUSTER' });
  await rejects(bootstrapTestDatabase(prisma, { url: TEST_URL }));
  assert.deepEqual(prisma.adapter.calls.execs, [], 'no marker planted on the wrong cluster');
});

test('bootstrap accepts a matching expected cluster', async () => {
  process.env.TEST_DB_EXPECTED_CLUSTER = SYS;
  const prisma = mockPrisma({ marker: null });
  await assert.doesNotReject(bootstrapTestDatabase(prisma, { url: TEST_URL }));
});

test('bootstrap allows a non-loopback URL only with the explicit override', async () => {
  process.env.TEST_DB_ALLOW_NONLOOPBACK_BOOTSTRAP = '1';
  const prisma = mockPrisma({ marker: null });
  await assert.doesNotReject(bootstrapTestDatabase(prisma, { url: REMOTE_TEST_URL }));
});

test('bootstrap refuses to claim a populated database with no marker (any object, not just User)', async () => {
  // `populated: true` models the pg_class probe finding ANY non-system object — e.g. an `L`
  // table or `_prisma_migrations` on a DB that has no `User` table.
  const prisma = mockPrisma({ marker: null, populated: true });
  await rejects(bootstrapTestDatabase(prisma, { url: TEST_URL }));
  assert.deepEqual(prisma.adapter.calls.execs, [], 'must not plant a marker on a populated DB');
});

test('bootstrap is idempotent when a matching marker already exists', async () => {
  const prisma = mockPrisma({ marker: { signature: MARKER_SIGNATURE, fingerprint: SYS } });
  await bootstrapTestDatabase(prisma, { url: TEST_URL });
  assert.deepEqual(prisma.adapter.calls.execs, [], 'no re-create when the marker matches');
});

test('bootstrap refuses to overwrite a marker from a different cluster', async () => {
  const prisma = mockPrisma({ sysid: 'CLUSTER-2', marker: { signature: MARKER_SIGNATURE, fingerprint: 'CLUSTER-1' } });
  await rejects(bootstrapTestDatabase(prisma, { url: TEST_URL }));
});

// ── guardedReset (verify + destructive SQL in one transaction) ──────────────────

test('guardedReset runs the statements on a verified, marked DB', async () => {
  const executed = [];
  const adapter = mockAdapter();
  const prisma = {
    $transaction: async (fn) =>
      fn({
        $queryRawUnsafe: (sql) => adapter.read(sql),
        $executeRawUnsafe: (sql) => {
          executed.push(sql);
          return adapter.exec(sql);
        },
      }),
  };
  await guardedReset(prisma, { url: TEST_URL, statements: ['TRUNCATE TABLE "L";'] });
  assert.deepEqual(executed, ['TRUNCATE TABLE "L";']);
});

test('guardedReset runs NO statements when the marker is missing', async () => {
  const executed = [];
  const adapter = mockAdapter({ marker: null });
  const prisma = {
    $transaction: async (fn) =>
      fn({
        $queryRawUnsafe: (sql) => adapter.read(sql),
        $executeRawUnsafe: (sql) => {
          executed.push(sql);
          return adapter.exec(sql);
        },
      }),
  };
  await rejects(guardedReset(prisma, { url: TEST_URL, statements: ['TRUNCATE TABLE "L";'] }));
  assert.deepEqual(executed, [], 'the TRUNCATE must never run');
});
