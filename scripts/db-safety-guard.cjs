'use strict';

/**
 * TEST-01 — Fail-closed guard for destructive test-database operations (the destructive DDL in
 * `prisma migrate deploy`, and the between-test `TRUNCATE`).
 *
 * Two separated responsibilities:
 *   • BOOTSTRAP (marker creation) — `bootstrapTestDatabase`. A distinct, loopback-gated step
 *     that plants a marker carrying the cluster's `system_identifier` as a FINGERPRINT (not a
 *     cryptographic signature). It refuses on a non-loopback URL and refuses to "claim" a
 *     database that already holds any objects.
 *   • VERIFY (migrate + reset) — `assertResettableTestDb` / `guardedReset`. Routine execution
 *     ONLY verifies an already-planted marker; it never creates one.
 *
 * Fingerprint scope: `system_identifier` proves the marker was planted on THIS Postgres
 * *cluster*. It does NOT distinguish databases within one cluster (the exact-name control does).
 * A physical clone (pg_basebackup/restore) keeps the same identifier, name, role, and marker, so
 * it passes ALL of these controls — **physical clones of a real database are OUTSIDE the
 * guarantee; never run the suite against one.** The controls defend against a mis-pointed
 * URL/name/role/host, not a cloned cluster.
 *
 * Verification checks, in order:
 *   1. explicit opt-in flag            ALLOW_TEST_DB_RESET=1   (scoped to destructive steps)
 *   2. EXACT database-name allowlist   TEST_DB_ALLOWED_NAMES   (default: "linkedout_test")
 *   3. actual connected name in allowlist    SELECT current_database()
 *   4. declared name === connected name      (no silent redirect)
 *   5. MANDATORY test-only login role        SELECT session_user
 *   6. a fingerprinted marker whose stored `system_identifier` == the CURRENT cluster's — so a
 *      dump restored onto a DIFFERENT cluster fails. (A physical clone keeps the identifier and
 *      passes everything — see the fingerprint-scope note above; that case is out of scope.)
 *
 * The verify + destructive SQL run in ONE transaction on ONE connection.
 */

const RESET_FLAG = 'ALLOW_TEST_DB_RESET';
const NONLOOPBACK_BOOTSTRAP_FLAG = 'TEST_DB_ALLOW_NONLOOPBACK_BOOTSTRAP';
// Set by setup to bind the CREATE step to the bootstrap/verify target: the name of the database
// setup created, and the system_identifier of the cluster it created it on.
const EXPECTED_NAME_ENV = 'TEST_DB_NAME';
const EXPECTED_CLUSTER_ENV = 'TEST_DB_EXPECTED_CLUSTER';
// The marker lives in a DEDICATED schema, not `public`: Prisma manages `public`, and
// `migrate deploy` refuses (P3005) if `public` is non-empty on a fresh DB. Keeping the marker
// out of `public` lets us plant it BEFORE migrate without tripping that check.
const MARKER_SCHEMA = 'linkedout_guard';
const MARKER_TABLE = '__linkedout_test_marker__';
const MARKER_REGCLASS_ARG = `${MARKER_SCHEMA}."${MARKER_TABLE}"`;
const MARKER_QUALIFIED = `"${MARKER_SCHEMA}"."${MARKER_TABLE}"`;
const MARKER_SIGNATURE = 'linkedout:disposable-test-db:v2';
const DEFAULT_ALLOWED_NAMES = ['linkedout_test'];

class UnsafeTestDatabaseError extends Error {
  constructor(message) {
    super(`Refusing destructive DB operation — ${message}`);
    this.name = 'UnsafeTestDatabaseError';
  }
}

/** Exact-match allowlist of database names (no regex). Configurable, safe default. */
function allowedNames() {
  const raw = process.env.TEST_DB_ALLOWED_NAMES;
  if (!raw) return DEFAULT_ALLOWED_NAMES;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function declaredDbName(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const path = new URL(url).pathname.replace(/^\/+/, '');
    return path.length > 0 ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

function urlHostIsLoopback(url) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}

function configuredUrl(opts) {
  return opts.url ?? process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? null;
}

async function connectedIdentity(adapter) {
  const rows = await adapter.read('SELECT current_database() AS db, session_user AS session_user');
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row.db !== 'string' || typeof row.session_user !== 'string') {
    throw new UnsafeTestDatabaseError('could not read current_database()/session_user.');
  }
  return { db: row.db, sessionUser: row.session_user };
}

/** The Postgres cluster's unique system identifier — used as the marker fingerprint. */
async function clusterFingerprint(adapter) {
  const rows = await adapter.read('SELECT system_identifier::text AS sysid FROM pg_control_system()');
  const sysid = Array.isArray(rows) ? rows[0] && rows[0].sysid : undefined;
  if (typeof sysid !== 'string' || sysid.length === 0) {
    throw new UnsafeTestDatabaseError('could not read the cluster system_identifier.');
  }
  return sysid;
}

/** Reads the marker's `{ signature, fingerprint }`, or null if the table/row is absent. */
async function readMarker(adapter) {
  const tableRows = await adapter.read(
    `SELECT to_regclass('${MARKER_REGCLASS_ARG}') IS NOT NULL AS table_exists`,
  );
  if (!(Array.isArray(tableRows) && tableRows[0] && tableRows[0].table_exists)) return null;
  const rows = await adapter.read(
    `SELECT signature, fingerprint FROM ${MARKER_QUALIFIED} LIMIT 1`,
  );
  const row = Array.isArray(rows) ? rows[0] : undefined;
  return row ? { signature: row.signature, fingerprint: row.fingerprint } : null;
}

/** Checks 1–5 (flag, exact allowlist ×2, declared==connected, mandatory session role). */
async function verify(adapter, opts = {}) {
  if (process.env[RESET_FLAG] !== '1') {
    throw new UnsafeTestDatabaseError(
      `${RESET_FLAG} is not "1". Set it only on a destructive step against a disposable test DB.`,
    );
  }

  const allow = allowedNames();
  const declared = declaredDbName(configuredUrl(opts));
  if (!declared || !allow.includes(declared)) {
    throw new UnsafeTestDatabaseError(
      `configured database ${JSON.stringify(declared)} is not in the exact allowlist ${JSON.stringify(allow)}.`,
    );
  }

  // When setup created a DB by name, the URL we act on must name that exact DB — otherwise
  // setup could CREATE `fresh_tmp` but bootstrap/verify a *different* same-cluster database.
  const expectedName = process.env[EXPECTED_NAME_ENV];
  if (expectedName && declared !== expectedName) {
    throw new UnsafeTestDatabaseError(
      `configured URL database ${JSON.stringify(declared)} != ${EXPECTED_NAME_ENV} ${JSON.stringify(expectedName)}.`,
    );
  }

  const { db, sessionUser } = await connectedIdentity(adapter);
  if (!allow.includes(db)) {
    throw new UnsafeTestDatabaseError(
      `connected database ${JSON.stringify(db)} is not in the exact allowlist ${JSON.stringify(allow)}.`,
    );
  }
  if (declared !== db) {
    throw new UnsafeTestDatabaseError(
      `configured name ${JSON.stringify(declared)} != connected database ${JSON.stringify(db)} (redirect).`,
    );
  }

  const expectedRole = process.env.TEST_DB_EXPECTED_SESSION_USER;
  if (!expectedRole) {
    throw new UnsafeTestDatabaseError(
      'TEST_DB_EXPECTED_SESSION_USER is required — pin the dedicated test login role.',
    );
  }
  if (sessionUser !== expectedRole) {
    throw new UnsafeTestDatabaseError(
      `session_user ${JSON.stringify(sessionUser)} != TEST_DB_EXPECTED_SESSION_USER ${JSON.stringify(expectedRole)}.`,
    );
  }

  return { db, sessionUser };
}

/** Check 6 — the fingerprinted marker exists AND its fingerprint matches this cluster. Never creates. */
async function verifyMarker(adapter) {
  const marker = await readMarker(adapter);
  if (!marker) {
    throw new UnsafeTestDatabaseError(
      `test-DB marker ${MARKER_QUALIFIED} is absent — bootstrap the test DB (scripts/bootstrap-test-db.cjs) first.`,
    );
  }
  if (marker.signature !== MARKER_SIGNATURE) {
    throw new UnsafeTestDatabaseError(
      `marker version tag ${JSON.stringify(marker.signature)} != expected ${JSON.stringify(MARKER_SIGNATURE)}.`,
    );
  }
  const sysid = await clusterFingerprint(adapter);
  if (marker.fingerprint !== sysid) {
    throw new UnsafeTestDatabaseError(
      'marker fingerprint does not match this cluster — the marker was created on a different server.',
    );
  }
}

/** The fail-closed guard for routine execution: checks 1–6. Never creates the marker. */
async function assertResettableTestDb(adapter, opts = {}) {
  await verify(adapter, opts);
  await verifyMarker(adapter);
}

/**
 * Binds bootstrap to the exact cluster setup just created on: if `TEST_DB_EXPECTED_CLUSTER` is
 * set (to a `system_identifier`), the connected cluster must match it. Closes the
 * same-name/different-loopback-cluster gap (e.g. two Postgres instances on different ports).
 */
async function assertExpectedCluster(adapter) {
  const expected = process.env[EXPECTED_CLUSTER_ENV];
  if (!expected) return;
  const sysid = await clusterFingerprint(adapter);
  if (sysid !== expected) {
    throw new UnsafeTestDatabaseError(
      `connected cluster ${JSON.stringify(sysid)} != ${EXPECTED_CLUSTER_ENV} ${JSON.stringify(expected)} — not the cluster setup created.`,
    );
  }
}

/**
 * BOOTSTRAP — loopback-gated marker creation, in one transaction. Refuses on a non-loopback URL
 * (unless TEST_DB_ALLOW_NONLOOPBACK_BOOTSTRAP=1) and refuses to claim a populated, unmarked DB.
 * Idempotent: a matching existing marker is left as-is.
 */
async function bootstrapTestDatabase(prisma, opts = {}) {
  const url = configuredUrl(opts);
  await prisma.$transaction(async (tx) => {
    const adapter = { read: (sql) => tx.$queryRawUnsafe(sql), exec: (sql) => tx.$executeRawUnsafe(sql) };
    await verify(adapter, { url });
    await assertExpectedCluster(adapter);

    if (!urlHostIsLoopback(url) && process.env[NONLOOPBACK_BOOTSTRAP_FLAG] !== '1') {
      throw new UnsafeTestDatabaseError(
        `bootstrap is only permitted against a loopback DB URL (got host of ${JSON.stringify(url)}); ` +
          `set ${NONLOOPBACK_BOOTSTRAP_FLAG}=1 to override for a known-ephemeral remote target.`,
      );
    }

    const sysid = await clusterFingerprint(adapter);
    const existing = await readMarker(adapter);
    if (existing) {
      if (existing.fingerprint !== sysid || existing.signature !== MARKER_SIGNATURE) {
        throw new UnsafeTestDatabaseError(
          'an incompatible marker already exists on this database — refusing to overwrite it.',
        );
      }
      return; // already bootstrapped for this cluster — idempotent
    }

    // No marker yet: refuse to claim a database that already holds ANY user object (table,
    // view, matview, sequence, foreign table) outside the system schemas and our own guard
    // schema — not just a "User" table. `_prisma_migrations`, an `L` table, a lone sequence,
    // etc. all count as "not virgin".
    const appRows = await adapter.read(
      `SELECT EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast', '${MARKER_SCHEMA}')
          AND n.nspname NOT LIKE 'pg_temp_%'
          AND n.nspname NOT LIKE 'pg_toast_temp_%'
          AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
       ) AS populated`,
    );
    if (Array.isArray(appRows) && appRows[0] && appRows[0].populated) {
      throw new UnsafeTestDatabaseError(
        'database already holds objects but no marker — refusing to claim it as a test DB (recreate it clean).',
      );
    }

    await adapter.exec(`CREATE SCHEMA IF NOT EXISTS "${MARKER_SCHEMA}"`);
    await adapter.exec(
      `CREATE TABLE ${MARKER_QUALIFIED} (` +
        `signature text PRIMARY KEY, fingerprint text NOT NULL, provisioned_at timestamptz NOT NULL DEFAULT now())`,
    );
    await adapter.exec(
      `INSERT INTO ${MARKER_QUALIFIED} (signature, fingerprint) VALUES ('${MARKER_SIGNATURE}', '${sysid}')`,
    );
  });
}

/**
 * Verify (1–6) and the destructive statements in ONE transaction on ONE connection, so the
 * guarded identity cannot change between the check and the SQL.
 */
async function guardedReset(prisma, { url, statements }) {
  await prisma.$transaction(async (tx) => {
    const adapter = { read: (sql) => tx.$queryRawUnsafe(sql), exec: (sql) => tx.$executeRawUnsafe(sql) };
    await assertResettableTestDb(adapter, { url });
    for (const sql of statements) {
      await tx.$executeRawUnsafe(sql);
    }
  });
}

/** Convenience: an `{ read, exec }` adapter over a Prisma client (non-transactional). */
function prismaAdapter(prisma) {
  return {
    read: (sql) => prisma.$queryRawUnsafe(sql),
    exec: (sql) => prisma.$executeRawUnsafe(sql),
  };
}

module.exports = {
  RESET_FLAG,
  NONLOOPBACK_BOOTSTRAP_FLAG,
  EXPECTED_NAME_ENV,
  EXPECTED_CLUSTER_ENV,
  assertExpectedCluster,
  MARKER_SCHEMA,
  MARKER_TABLE,
  MARKER_QUALIFIED,
  MARKER_SIGNATURE,
  DEFAULT_ALLOWED_NAMES,
  allowedNames,
  declaredDbName,
  urlHostIsLoopback,
  UnsafeTestDatabaseError,
  verify,
  verifyMarker,
  readMarker,
  clusterFingerprint,
  bootstrapTestDatabase,
  assertResettableTestDb,
  guardedReset,
  prismaAdapter,
};
