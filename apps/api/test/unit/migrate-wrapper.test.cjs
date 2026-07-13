'use strict';

// TEST-01 — the migrate wrapper must refuse when DATABASE_URL/DIRECT_URL disagree with the
// canonical TEST_DATABASE_URL, so a safe verified target can't be paired with an unsafe
// migration target. It aborts at the disagreement check, before connecting — no DB needed.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const SCRIPT = path.resolve(__dirname, '../../../../scripts/migrate-test-db.cjs');
const SAFE = 'postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public';
const PROD = 'postgresql://app:secret@db.prod.example:5432/linkedout_prod?schema=public';

function run(extraEnv) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ALLOW_TEST_DB_RESET: '1',
      TEST_DB_EXPECTED_SESSION_USER: 'linkedout',
      TEST_DATABASE_URL: SAFE,
      DATABASE_URL: undefined,
      DIRECT_URL: undefined,
      ...extraEnv,
    },
  });
}

test('migrate wrapper aborts when DIRECT_URL points at a different (production) DB', () => {
  const result = run({ DIRECT_URL: PROD });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DIRECT_URL disagrees/);
});

test('migrate wrapper aborts when DATABASE_URL disagrees with TEST_DATABASE_URL', () => {
  const result = run({ DATABASE_URL: PROD });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /DATABASE_URL disagrees/);
});

test('migrate wrapper aborts when TEST_DATABASE_URL is unset', () => {
  const result = run({ TEST_DATABASE_URL: undefined });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /TEST_DATABASE_URL must be set/);
});
