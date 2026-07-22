'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync, readdirSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const ROOT = resolve(__dirname, '../../../..');

test('retired Journey and Collection implementation surfaces cannot quietly return', () => {
  for (const path of [
    'apps/api/src/modules/collections',
    'apps/web/src/app/collections',
    'apps/web/src/components/collections',
  ]) {
    const absolute = resolve(ROOT, path);
    const files = existsSync(absolute)
      ? readdirSync(absolute, { recursive: true, withFileTypes: true }).filter((entry) =>
          entry.isFile(),
        )
      : [];
    assert.deepEqual(files, [], `${path} stays empty or absent`);
  }

  for (const path of [
    'apps/web/src/components/profile/collection-card.tsx',
    'apps/web/src/components/profile/journey-timeline.tsx',
    'packages/contracts/src/collection.ts',
  ]) {
    assert.equal(existsSync(resolve(ROOT, path)), false, `${path} stays deleted`);
  }

  const endpoints = readFileSync(resolve(ROOT, 'apps/web/src/lib/api/endpoints.ts'), 'utf8');
  for (const client of [
    'addLToCollection',
    'createCollection',
    'deleteCollection',
    'getCollection',
    'getJourney',
    'getUserCollections',
    'removeLFromCollection',
    'renameCollection',
  ]) {
    assert.doesNotMatch(endpoints, new RegExp(`export const ${client}\\b`), `${client} stays retired`);
  }

  const queryKeys = readFileSync(resolve(ROOT, 'apps/web/src/lib/query-keys.ts'), 'utf8');
  assert.doesNotMatch(queryKeys, /^\s*(collections|journey):\s*\{/m);
});
