'use strict';

/**
 * Fails if the unit-test glob would run fewer files than `test/unit` actually holds.
 *
 * `node --test "test/unit/**\/*.test.cjs"` exits 0 when the glob matches nothing — so renaming
 * the suffix, moving the directory, or fixing a typo in the pattern turns the CI step green
 * while asserting nothing at all. Nothing downstream notices: a suite that runs zero tests and
 * a suite that passes look identical to the workflow.
 *
 * Rather than a hand-maintained count, this compares what the runner's glob matches against
 * every candidate file on disk. Adding a test needs no change here; a file the runner would
 * silently skip is an error naming the file.
 */

const assert = require('node:assert/strict');
const { globSync } = require('node:fs');
const { basename, join } = require('node:path');

const API_DIR = join(__dirname, '../apps/api');
const RUNNER_PATTERN = 'test/unit/**/*.test.cjs';

/** Every file under test/unit that is meant to be a test — `_`-prefixed files are helpers. */
function candidateFiles() {
  return globSync('test/unit/**/*.cjs', { cwd: API_DIR }).filter(
    (file) => !basename(file).startsWith('_'),
  );
}

const matched = globSync(RUNNER_PATTERN, { cwd: API_DIR }).sort();
const candidates = candidateFiles().sort();

assert.ok(
  matched.length > 0,
  `${RUNNER_PATTERN} matched no files — the unit suite would report success without running.`,
);
assert.deepEqual(
  matched,
  candidates,
  `These files live in test/unit but ${RUNNER_PATTERN} does not match them, so the runner ` +
    `skips them silently. Rename them to *.test.cjs, or prefix a helper with "_":\n  ` +
    candidates.filter((file) => !matched.includes(file)).join('\n  '),
);

process.stdout.write(`unit test inventory: ${matched.length} files matched by the runner\n`);
