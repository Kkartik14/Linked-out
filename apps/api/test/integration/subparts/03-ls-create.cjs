'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lDetailSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const VALID = {
  title: 'Rejected after the final round at Google',
  story: 'Four rounds in, strong signals, and then the recruiter went silent.',
};

describe('03 · POST /ls — create (contract §4.3)', () => {
  let author;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'kartik' });
  });

  test('creates an L, returns 201 and a contract-valid LDetail', async () => {
    const res = await h.post('/ls', { cookie: author.cookie, body: VALID });
    const l = h.expectShape(res, lDetailSchema, 201);

    assert.equal(l.title, VALID.title);
    assert.equal(l.story, VALID.story);
    assert.equal(l.author.username, 'kartik');
    assert.deepEqual(l.collections, []);
    assert.deepEqual(l.viewer, { reactions: [], canEdit: true });
    assert.deepEqual(l.reactions, {
      total: 0,
      beenThere: 0,
      helpful: 0,
      respect: 0,
      pain: 0,
      saved: 0,
    });
    assert.equal(l.commentCount, 0);
  });

  test('applies the documented defaults', async () => {
    const res = await h.post('/ls', { cookie: author.cookie, body: VALID });
    const l = h.expectShape(res, lDetailSchema, 201);

    assert.equal(l.type, 'L');
    assert.equal(l.visibility, 'PUBLIC');
    assert.equal(l.isAnonymous, false);
    assert.equal(l.resolvedAt, null);
  });

  test('persists every supported optional field', async () => {
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: {
        ...VALID,
        type: 'STORY',
        visibility: 'FOLLOWERS',
        isAnonymous: false,
      },
    });
    const l = h.expectShape(res, lDetailSchema, 201);

    assert.equal(l.type, 'STORY');
    assert.equal(l.visibility, 'FOLLOWERS');
  });

  test('an anonymous L hides its author from its own creator', async () => {
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: { ...VALID, isAnonymous: true },
    });
    const l = h.expectShape(res, lDetailSchema, 201);

    assert.equal(l.author, null, 'anonymity is server-enforced, even for the author');
    assert.equal(l.isAnonymous, true);
    assert.equal(l.viewer.canEdit, true, 'the author can still edit their anonymous L');
  });

  test('increments lsShared, and storiesShared/lessonsShared by type', async () => {
    await h.post('/ls', { cookie: author.cookie, body: VALID });
    await h.post('/ls', { cookie: author.cookie, body: { ...VALID, type: 'STORY' } });
    await h.post('/ls', { cookie: author.cookie, body: { ...VALID, type: 'LESSON' } });
    await h.post('/ls', { cookie: author.cookie, body: { ...VALID, type: 'WIN' } });

    const { body } = await h.get('/users/kartik');
    assert.deepEqual(body.reputation, {
      lsShared: 4,
      storiesShared: 1,
      lessonsShared: 1,
      collectionsCreated: 0,
    });
  });

  test('requires authentication', async () => {
    h.expectError(await h.post('/ls', { body: VALID }), 401, 'UNAUTHENTICATED');
  });

  test('requires a finished onboarding (username) before creating', async () => {
    const fresh = await h.createOnboardingUser();
    const res = await h.post('/ls', { cookie: fresh.cookie, body: VALID });
    h.expectError(res, 403, 'FORBIDDEN');
  });

  test('rejects a missing title/story with per-field VALIDATION_ERROR details', async () => {
    const res = await h.post('/ls', { cookie: author.cookie, body: {} });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');

    assert.ok(Array.isArray(error.details), 'details must be an array (contract §1.7)');
    const fields = error.details.map((d) => d.field).sort();
    assert.deepEqual(fields, ['story', 'title']);
    for (const detail of error.details) {
      assert.equal(detail.code, 'required');
      assert.equal(typeof detail.message, 'string');
    }
  });

  test('enforces the documented field limits', async () => {
    const cases = [
      [{ ...VALID, title: '' }, 'title', 'too_short'],
      [{ ...VALID, title: 'x'.repeat(141) }, 'title', 'too_long'],
      [{ ...VALID, story: '' }, 'story', 'too_short'],
      [{ ...VALID, story: 'x'.repeat(10_001) }, 'story', 'too_long'],
      [{ ...VALID, type: 'NOPE' }, 'type', 'invalid_enum'],
      [{ ...VALID, visibility: 'SECRET' }, 'visibility', 'invalid_enum'],
    ];

    for (const [body, field, code] of cases) {
      const res = await h.post('/ls', { cookie: author.cookie, body });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      const detail = error.details.find((d) => d.field === field);
      assert.ok(detail, `expected a detail for "${field}", got ${JSON.stringify(error.details)}`);
      assert.equal(detail.code, code, `expected code ${code} for ${field}`);
    }
  });

  test('accepts a boundary-valid 140-character title', async () => {
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: {
        title: 'x'.repeat(140),
        story: 'y',
      },
    });
    h.expectShape(res, lDetailSchema, 201);
  });

  test('strictly rejects removed fields', async () => {
    for (const field of ['category', 'company', 'tags', 'eventDate']) {
      const res = await h.post('/ls', {
        cookie: author.cookie,
        body: { ...VALID, [field]: null },
      });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      assert.ok(error.details.some((detail) => detail.field === field));
    }
  });

  test('created Ls receive a ULID id', async () => {
    const res = await h.post('/ls', { cookie: author.cookie, body: VALID });
    assert.match(res.body.id, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'id must be a 26-char ULID');
  });
});
