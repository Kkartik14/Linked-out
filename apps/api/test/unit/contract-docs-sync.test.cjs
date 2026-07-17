'use strict';

const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const test = require('node:test');

const {
  CANONICAL_PATH,
  LOCAL_PATH,
  renderLocalCopy,
} = require('../../../../scripts/sync-contract-docs.cjs');

// `local/` is gitignored, so the reading copy exists on a developer machine and never in CI.
// Skipping there is the honest outcome: this guards a working copy, and asserting on a file
// that cannot exist in CI would only ever fail for the wrong reason.
test('local/contract-v2.md is the canonical contract plus the local banner', { skip: existsSync(LOCAL_PATH) ? false : 'local/ is not checked out' }, () => {
  assert.equal(
    readFileSync(LOCAL_PATH, 'utf8'),
    renderLocalCopy(readFileSync(CANONICAL_PATH, 'utf8')),
    'local/contract-v2.md is stale — run `pnpm docs:sync-contract`',
  );
});

// docs/ is tracked, so this half is a real CI gate.
test('the contract documents the v2 credential rule the guards implement', () => {
  const canonical = readFileSync(CANONICAL_PATH, 'utf8');
  // The rule the StrictOptionalAuthGuard split exists to satisfy. Pinned here because the guard
  // policy is only defensible if the contract actually states it — the drift the frontend team
  // reported was a v2 route following v1's unwritten habit instead of this rule.
  assert.match(canonical, /## 0\. Authentication is uniform across v2/);
  assert.match(canonical, /never silently downgrades a bad credential to a guest/);
});
