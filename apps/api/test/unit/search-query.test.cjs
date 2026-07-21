'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { lSearchTerms } = require('../../dist/modules/search/search-query');

test('L search isolates a safe Unicode final prefix from completed terms', () => {
  assert.deepEqual(lSearchTerms('running a migr'), {
    completed: 'running a',
    prefix: 'migr',
  });
  assert.deepEqual(lSearchTerms('déjà vu'), { completed: 'déjà', prefix: 'vu' });
  assert.deepEqual(lSearchTerms("' OR 1=1 --"), { completed: 'OR 1', prefix: '1' });
});

test('L search ignores punctuation-only input instead of creating tsquery syntax', () => {
  assert.equal(lSearchTerms('&|! :* \\'), null);
});
