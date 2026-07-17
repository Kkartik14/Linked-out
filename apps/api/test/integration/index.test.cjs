'use strict';

/**
 * Integration entry point.
 *
 * All subparts run in ONE process against ONE booted server so the suite stays
 * fast and the DB can be truncated deterministically between tests. Each file
 * under `subparts/` registers its own `describe` block.
 *
 * Run with:  pnpm --filter @linkedout/api test:integration
 */

const { globSync } = require('node:fs');
const assert = require('node:assert/strict');
const { before, after } = require('node:test');
const h = require('./_harness.cjs');

before(async () => {
  await h.start();
});

after(async () => {
  await h.stop();
});

// Discovered, not hand-listed: a subpart that nobody remembered to require would otherwise sit
// silently unrun while the suite reported green. Sorted so the numeric prefixes still fix the
// order (subparts share one server and truncate between tests, so order stays deterministic).
const subparts = globSync('subparts/*.cjs', { cwd: __dirname }).sort();

// A glob that matches nothing makes every assertion below vacuous, and node --test exits 0 on an
// empty run — so the floor is asserted rather than assumed.
assert.ok(subparts.length >= 22, `expected >= 22 integration subparts, found ${subparts.length}`);

for (const subpart of subparts) {
  require(`./${subpart}`);
}
