'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const {
  metaEnumsResponseSchema,
  popularTagsResponseSchema,
  L_TYPE_META,
  L_CATEGORY_META,
  REACTION_TYPE_META,
  JOURNEY_STATUS_META,
  VISIBILITY_META,
  NOTIFICATION_TYPE_META,
  REPUTATION_META,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

describe('01 · meta & discovery (contract §4.12)', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('GET /meta/enums is public and matches the contract schema', async () => {
    const res = await h.get('/meta/enums');
    h.expectShape(res, metaEnumsResponseSchema);
  });

  test('GET /meta/enums serves every enum value the contracts package declares', async () => {
    const { body } = await h.get('/meta/enums');
    const values = (list) => list.map((m) => m.value);

    assert.deepEqual(values(body.lType), values(L_TYPE_META));
    assert.deepEqual(values(body.lCategory), values(L_CATEGORY_META));
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
    assert.equal(
      body.lType.find((t) => t.value === 'LESSON').sectionLabel,
      'Character Development',
    );
    assert.equal(
      body.reputation.find((r) => r.key === 'buildersHelped').label,
      'Builders Helped',
    );
  });

  test('GET /openapi.json is served and describes the v1 surface', async () => {
    const res = await h.get('/openapi.json');
    assert.equal(res.status, 200);
    assert.equal(typeof res.body.openapi, 'string');
    assert.ok(res.body.openapi.startsWith('3.'), 'must be OpenAPI 3.x');
    assert.ok(res.body.paths && typeof res.body.paths === 'object');
  });

  test('GET /tags/popular returns the contract shape and is public', async () => {
    const res = await h.get('/tags/popular');
    h.expectShape(res, popularTagsResponseSchema);
  });

  test('GET /tags/popular counts tags across PUBLIC Ls only, most-used first', async () => {
    const author = await h.createUser();
    await h.createL(author.id, { tags: ['interview', 'faang'] });
    await h.createL(author.id, { tags: ['interview'] });
    await h.createL(author.id, { tags: ['interview', 'secret'], visibility: 'PRIVATE' });
    await h.createL(author.id, { tags: ['followers-only'], visibility: 'FOLLOWERS' });

    const { body } = await h.get('/tags/popular');
    const byTag = Object.fromEntries(body.tags.map((t) => [t.tag, t.count]));

    assert.equal(byTag.interview, 2, 'PRIVATE L must not contribute to the tag count');
    assert.equal(byTag.faang, 1);
    assert.equal(byTag.secret, undefined, 'PRIVATE tags must never leak');
    assert.equal(byTag['followers-only'], undefined, 'FOLLOWERS tags must never leak');
    assert.equal(body.tags[0].tag, 'interview', 'ordered by count desc');
  });

  test('GET /tags/popular?q= filters by prefix', async () => {
    const author = await h.createUser();
    await h.createL(author.id, { tags: ['interview', 'internship', 'layoff'] });

    const { body } = await h.get('/tags/popular?q=inter');
    const tags = body.tags.map((t) => t.tag).sort();
    assert.deepEqual(tags, ['internship', 'interview']);
  });

  test('GET /tags/popular?limit caps the page and rejects out-of-range values', async () => {
    const author = await h.createUser();
    await h.createL(author.id, { tags: ['a', 'b', 'c'] });

    const ok = await h.get('/tags/popular?limit=2');
    assert.equal(ok.body.tags.length, 2);

    h.expectError(await h.get('/tags/popular?limit=21'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/tags/popular?limit=0'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/tags/popular?limit=abc'), 400, 'VALIDATION_ERROR');
  });

  test('unknown routes render the standard error envelope, not an HTML 404', async () => {
    const res = await h.get('/definitely-not-a-route');
    h.expectError(res, 404, 'NOT_FOUND');
  });
});
