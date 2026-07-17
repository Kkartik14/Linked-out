'use strict';

/**
 * Regenerates `local/contract-v2.md` from the canonical `docs/api-contract-v2.md`.
 *
 * The two copies drifted before (the local one still advertised "implementation pending" long
 * after the routes shipped), and a stale contract is worse than no contract: the frontend team
 * reads it as current. `local/` is a reading copy, so it is generated rather than hand-edited —
 * only the banner differs. Run after editing the canonical doc; the paired unit test
 * (`apps/api/test/unit/contract-docs-sync.test.cjs`) fails CI if this was not run.
 *
 *   node scripts/sync-contract-docs.cjs [--check]
 *
 * `--check` exits 1 on drift instead of writing, for use outside the test runner.
 */

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO_ROOT = join(__dirname, '..');
const CANONICAL_PATH = join(REPO_ROOT, 'docs/api-contract-v2.md');
const LOCAL_PATH = join(REPO_ROOT, 'local/contract-v2.md');

const BANNER = [
  '> Canonical tracked copy: [`docs/api-contract-v2.md`](../docs/api-contract-v2.md). This local',
  '> reading copy is generated from it — edit the canonical file, then run',
  '> `pnpm docs:sync-contract`. `apps/api/test/unit/contract-docs-sync.test.cjs` fails on drift.',
].join('\n');

/** Canonical content with the local-only banner inserted under the title. */
function renderLocalCopy(canonical) {
  const lines = canonical.split('\n');
  const title = lines[0];
  if (title === undefined || !title.startsWith('# ')) {
    throw new Error(`${CANONICAL_PATH} must open with a markdown H1 title`);
  }
  // Line 1 is the blank line after the title; the body resumes at line 2.
  return [title, '', BANNER, '', ...lines.slice(2)].join('\n');
}

module.exports = { CANONICAL_PATH, LOCAL_PATH, renderLocalCopy };

if (require.main === module) {
  const expected = renderLocalCopy(readFileSync(CANONICAL_PATH, 'utf8'));
  if (process.argv.includes('--check')) {
    const actual = readFileSync(LOCAL_PATH, 'utf8');
    if (actual !== expected) {
      process.stderr.write(
        'local/contract-v2.md is out of sync with docs/api-contract-v2.md.\n' +
          'Run: pnpm docs:sync-contract\n',
      );
      process.exitCode = 1;
    }
    return;
  }
  writeFileSync(LOCAL_PATH, expected);
  process.stdout.write('local/contract-v2.md regenerated from docs/api-contract-v2.md\n');
}
