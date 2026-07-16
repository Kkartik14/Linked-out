'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const { feedSidebarResponseSchema } = require('@linkedout/contracts/v2');

const h = require('../_harness.cjs');

function sidebar(cookie) {
  return h.request('GET', '/feed/sidebar', {
    baseUrl: h.ctx.v2BaseUrl,
    cookie,
  });
}

describe('21 · GET /v2/feed/sidebar', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('a guest gets a schema-valid empty aggregate with private no-store caching', async () => {
    const res = await sidebar();
    const body = h.expectShape(res, feedSidebarResponseSchema);

    assert.deepEqual(body.viewer, { state: 'SIGNED_OUT', profile: null });
    assert.deepEqual(body.peopleToFollow, { personalized: false, items: [] });
    assert.deepEqual(body.topLs.items, []);
    assert.equal(body.lOfTheDay, null);
    assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.ok(Date.parse(body.refreshAfter) > Date.parse(body.generatedAt));
  });
});
