'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const test = require('node:test');

test('the destructive seed refuses before connecting unless explicitly authorized', () => {
  const seed = resolve(__dirname, '../../../../packages/db/prisma/seed.cjs');
  const result = spawnSync(process.execPath, [seed], {
    cwd: resolve(__dirname, '../../../..'),
    env: {
      ...process.env,
      ALLOW_DB_SEED: '',
      DATABASE_URL: 'postgresql://nobody:nothing@127.0.0.1:1/production',
      DIRECT_URL: 'postgresql://nobody:nothing@127.0.0.1:1/production',
    },
    encoding: 'utf8',
    timeout: 5_000,
  });

  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /ALLOW_DB_SEED=1/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /Can't reach database server/);
});
