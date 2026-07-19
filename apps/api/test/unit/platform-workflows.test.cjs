'use strict';

const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '../../../..');
const WORKFLOWS = path.join(ROOT, '.github/workflows');

test('third-party GitHub Actions are pinned to immutable commit SHAs', () => {
  const approved = new Set([
    'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
    'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
    'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
    'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
    'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093',
  ]);
  const rejected = [];
  for (const filename of readdirSync(WORKFLOWS).filter((name) => /\.ya?ml$/.test(name))) {
    const source = readFileSync(path.join(WORKFLOWS, filename), 'utf8');
    for (const match of source.matchAll(/^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm)) {
      const action = match[1];
      if (!action.startsWith('./') && !approved.has(action)) {
        rejected.push(`${filename}: ${action}`);
      }
    }
  }

  assert.deepEqual(rejected, [], 'external actions must use a reviewed coordinate and SHA');
});
