'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const {
  metaEnumsResponseSchema,
  L_TYPE_META,
  REACTION_TYPE_META,
  JOURNEY_STATUS_META,
  VISIBILITY_META,
  NOTIFICATION_TYPE_META,
  REPUTATION_META,
  operationalHealthResponseSchema,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const STATIC_METADATA_CACHE_CONTROL =
  'public, max-age=86400, stale-while-revalidate=604800';

describe('01 · meta & discovery (contract §4.12)', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('GET /meta/enums is public and matches the contract schema', async () => {
    const res = await h.get('/meta/enums');
    h.expectShape(res, metaEnumsResponseSchema);
    assert.equal(res.headers.get('cache-control'), STATIC_METADATA_CACHE_CONTROL);
  });

  test('GET /meta/enums serves every enum value the contracts package declares', async () => {
    const { body } = await h.get('/meta/enums');
    const values = (list) => list.map((m) => m.value);

    assert.deepEqual(values(body.lType), values(L_TYPE_META));
    assert.equal('lCategory' in body, false);
    assert.deepEqual(values(body.reactionType), values(REACTION_TYPE_META));
    assert.deepEqual(values(body.journeyStatus), values(JOURNEY_STATUS_META));
    assert.deepEqual(values(body.visibility), values(VISIBILITY_META));
    assert.deepEqual(values(body.notificationType), values(NOTIFICATION_TYPE_META));
    assert.deepEqual(
      body.reputation.map((r) => r.key),
      REPUTATION_META.map((r) => r.key),
    );
  });

  test('GET /meta/enums carries the display metadata the FE renders (emoji, dot, sectionLabel)', async () => {
    const { body } = await h.get('/meta/enums');
    assert.equal(body.reactionType.find((r) => r.value === 'BEEN_THERE').emoji, '💔');
    assert.equal(body.journeyStatus.find((s) => s.value === 'BUILDING').dot, '🔵');
    assert.deepEqual(
      body.lType.map((type) => type.value),
      ['L', 'WIN', 'STORY', 'SCAR', 'PLOT_TWIST', 'BATTLE'],
    );
    assert.equal(
      body.reputation.some((r) => r.key === 'buildersHelped'),
      false,
    );
    assert.equal(body.reputation.some((r) => r.key === 'lessonsShared'), false);
  });

  test('GET /openapi.json is served and describes the v1 surface', async () => {
    const res = await h.get('/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.openapi, 'string');
    assert.ok(res.body.openapi.startsWith('3.'), 'must be OpenAPI 3.x');
    assert.ok(res.body.paths && typeof res.body.paths === 'object');
    assert.equal(res.headers.get('cache-control'), STATIC_METADATA_CACHE_CONTROL);
  });

  test('operations probes distinguish private API, database, and session authority', async () => {
    for (const component of ['private-api', 'database', 'session-authority']) {
      const res = await h.get(`/health/${component}`);
      const body = h.expectShape(res, operationalHealthResponseSchema);
      assert.deepEqual(body, { status: 'ok', component });
      assert.equal(res.headers.get('cache-control'), 'private, no-store, max-age=0');
    }
  });

  test('removed tag discovery route is not exposed', async () => {
    h.expectError(await h.get('/tags/popular'), 404, 'NOT_FOUND');
  });

  test('unknown routes render the standard error envelope, not an HTML 404', async () => {
    const res = await h.get('/definitely-not-a-route');
    h.expectError(res, 404, 'NOT_FOUND');
  });
});
