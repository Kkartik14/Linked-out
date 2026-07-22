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
// empty run. Keep the inventory explicit so an accidental rename/deletion cannot silently shrink
// backend coverage; new files are still discovered and require an intentional inventory update.
assert.deepEqual(subparts, [
  'subparts/01-meta.cjs',
  'subparts/02-auth.cjs',
  'subparts/03-ls-create.cjs',
  'subparts/04-ls-visibility.cjs',
  'subparts/05-ls-update-delete.cjs',
  'subparts/06-feed.cjs',
  'subparts/07-reactions.cjs',
  'subparts/08-comments.cjs',
  'subparts/09-follows.cjs',
  'subparts/10-collections.cjs',
  'subparts/11-notifications.cjs',
  'subparts/12-search.cjs',
  'subparts/13-users-profile.cjs',
  'subparts/14-journey-saved.cjs',
  'subparts/16-uploads.cjs',
  'subparts/17-anonymity.cjs',
  'subparts/18-contract-invariants.cjs',
  'subparts/19-rate-limit.cjs',
  'subparts/20-concurrency-edges.cjs',
  'subparts/21-feed-sidebar.cjs',
  'subparts/22-public-api.cjs',
  'subparts/23-auth-uniformity.cjs',
  'subparts/23-browser-session-authority.cjs',
  'subparts/24-internal-auth.cjs',
  'subparts/24-oauth-handoff.cjs',
  'subparts/25-principal-binding.cjs',
  'subparts/26-session-resolve.cjs',
  'subparts/27-keyset-query-plans.cjs',
  'subparts/28-email-auth.cjs',
]);

for (const subpart of subparts) {
  require(`./${subpart}`);
}
