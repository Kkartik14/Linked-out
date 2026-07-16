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

const { before, after } = require('node:test');
const h = require('./_harness.cjs');

before(async () => {
  await h.start();
});

after(async () => {
  await h.stop();
});

require('./subparts/01-meta.cjs');
require('./subparts/02-auth.cjs');
require('./subparts/03-ls-create.cjs');
require('./subparts/04-ls-visibility.cjs');
require('./subparts/05-ls-update-delete.cjs');
require('./subparts/06-feed.cjs');
require('./subparts/07-reactions.cjs');
require('./subparts/08-comments.cjs');
require('./subparts/09-follows.cjs');
require('./subparts/10-collections.cjs');
require('./subparts/11-notifications.cjs');
require('./subparts/12-search.cjs');
require('./subparts/13-users-profile.cjs');
require('./subparts/14-journey-saved.cjs');
require('./subparts/16-uploads.cjs');
require('./subparts/17-anonymity.cjs');
require('./subparts/18-contract-invariants.cjs');
require('./subparts/19-rate-limit.cjs');
require('./subparts/20-concurrency-edges.cjs');
require('./subparts/21-feed-sidebar-v2.cjs');
