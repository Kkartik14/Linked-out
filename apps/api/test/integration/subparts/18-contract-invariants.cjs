'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const {
  errorEnvelopeSchema,
  fieldErrorCodeSchema,
  PRINCIPAL_BINDING_HEADER,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const PRIVATE_NO_STORE = 'private, no-store, max-age=0';

/** Every list endpoint, so cross-cutting pagination rules are checked once, everywhere. */
const LIST_ENDPOINTS = [
  { path: '/feed', auth: false },
  { path: '/feed/following', auth: true },
  { path: '/users/probe/ls', auth: false },
  { path: '/users/probe/collections', auth: false },
  { path: '/users/probe/followers', auth: false },
  { path: '/users/probe/following', auth: false },
  { path: '/me/saved', auth: true },
  { path: '/notifications', auth: true },
  { path: '/search?q=x&', auth: false, query: true },
];

describe('18 · cross-cutting contract invariants (§1.5–§1.7)', () => {
  let user;

  beforeEach(async () => {
    await h.resetDb();
    user = await h.createUser({ username: 'probe' });
  });

  const url = (endpoint, params) => {
    const sep = endpoint.query ? '' : '?';
    return `${endpoint.path}${sep}${params}`;
  };

  test('every list endpoint returns the { data, nextCursor } envelope', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const res = await h.get(url(endpoint, ''), { cookie: endpoint.auth ? user.cookie : undefined });
      assert.equal(res.status, 200, `${endpoint.path} → ${res.status}`);
      assert.ok(Array.isArray(res.body.data), `${endpoint.path} must return data[]`);
      assert.ok('nextCursor' in res.body, `${endpoint.path} must return nextCursor`);
      assert.equal(res.body.nextCursor, null, `${endpoint.path} empty page → null cursor`);
    }
  });

  test('every list endpoint rejects a malformed cursor with 400 BAD_CURSOR', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const res = await h.get(url(endpoint, 'cursor=%2Fnot-a-cursor'), {
        cookie: endpoint.auth ? user.cookie : undefined,
      });
      h.expectError(res, 400, 'BAD_CURSOR');
    }
  });

  test('every list endpoint enforces its limit bounds', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const cookie = endpoint.auth ? user.cookie : undefined;
      const max = endpoint.maxLimit ?? 50;

      assert.equal((await h.get(url(endpoint, `limit=${max}`), { cookie })).status, 200);
      h.expectError(await h.get(url(endpoint, `limit=${max + 1}`), { cookie }), 400, 'VALIDATION_ERROR');
      h.expectError(await h.get(url(endpoint, 'limit=0'), { cookie }), 400, 'VALIDATION_ERROR');
      h.expectError(await h.get(url(endpoint, 'limit=nope'), { cookie }), 400, 'VALIDATION_ERROR');
    }
  });

  test('every list endpoint rejects unknown query parameters', async () => {
    for (const endpoint of LIST_ENDPOINTS) {
      const res = await h.get(url(endpoint, 'limti=5'), {
        cookie: endpoint.auth ? user.cookie : undefined,
      });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      assert.equal(error.details[0].field, 'limti', endpoint.path);
    }
  });

  test('cursors are opaque base64url that decode to an object, never a raw id', async () => {
    for (let i = 0; i < 3; i += 1) await h.createL(user.id, { title: `L${i}` });

    const { body } = await h.get('/feed?limit=1');
    assert.ok(body.nextCursor, 'a partial page must expose a cursor');
    assert.match(body.nextCursor, /^[A-Za-z0-9_-]+$/, 'base64url charset only');

    const decoded = JSON.parse(Buffer.from(body.nextCursor, 'base64url').toString('utf8'));
    assert.equal(typeof decoded, 'object');
    assert.notEqual(body.nextCursor, body.data[0].id, 'the cursor is not the raw id');
  });

  test('a cursor from one endpoint is never silently honoured by an unrelated one', async () => {
    for (let i = 0; i < 3; i += 1) await h.createL(user.id);
    const feed = await h.get('/feed?limit=1');
    const cursor = encodeURIComponent(feed.body.nextCursor);

    const res = await h.get(`/notifications?cursor=${cursor}`, { cookie: user.cookie });
    h.expectError(res, 400, 'BAD_CURSOR');
  });

  test('every error response satisfies the ErrorEnvelope schema', async () => {
    const failures = [
      await h.get('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV'),
      await h.get('/users/ghost'),
      await h.get('/notifications'),
      await h.get('/feed?sort=nope'),
      await h.get('/feed?cursor=%2Fbad'),
      await h.post('/ls', { cookie: user.cookie, body: {} }),
      await h.get('/nowhere'),
      await h.get('/auth/github'),
    ];

    for (const res of failures) {
      assert.ok(res.status >= 400, `expected a failure, got ${res.status}`);
      const parsed = errorEnvelopeSchema.safeParse(res.body);
      assert.ok(parsed.success, `bad envelope: ${JSON.stringify(res.body)}`);
    }
  });

  test('successes and failures fail closed with the canonical private cache policy', async () => {
    const malformedJson = await fetch(`${h.ctx.baseUrl}/ls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: user.cookie,
        [PRINCIPAL_BINDING_HEADER]: user.id,
      },
      body: '{ this is not json',
    });
    const responses = [
      await h.get('/auth/me'),
      await h.get('/notifications'),
      await h.get('/feed?sort=nope'),
      await h.get('/no/such/route'),
      malformedJson,
    ];

    for (const response of responses) {
      assert.equal(
        response.headers.get('cache-control'),
        PRIVATE_NO_STORE,
        `${response.status} response must use the canonical private cache policy`,
      );
    }
  });

  test('error.details only appears on VALIDATION_ERROR, and uses the stable code set', async () => {
    const notValidation = await h.get('/users/ghost');
    assert.equal(notValidation.body.error.details, undefined);

    const validation = await h.post('/ls', {
      cookie: user.cookie,
      body: { title: '', story: 'x'.repeat(10_001), tags: ['a', 'b', 'c', 'd', 'e', 'f'] },
    });
    const error = h.expectError(validation, 400, 'VALIDATION_ERROR');

    assert.ok(Array.isArray(error.details));
    for (const detail of error.details) {
      assert.ok(fieldErrorCodeSchema.safeParse(detail.code).success, `unstable code ${detail.code}`);
      assert.equal(typeof detail.field, 'string');
      assert.ok(detail.message.length > 0);
    }
  });

  test('removed fields are named precisely in validation errors', async () => {
    const res = await h.post('/ls', {
      cookie: user.cookie,
      body: { title: 't', story: 's', category: 'CAREER' },
    });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].field, 'category');
  });

  test('a malformed JSON body is a 400, never a 500', async () => {
    const res = await fetch(`${h.ctx.baseUrl}/ls`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: user.cookie,
        [PRINCIPAL_BINDING_HEADER]: user.id,
      },
      body: '{ this is not json',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(errorEnvelopeSchema.safeParse(body).success, JSON.stringify(body));
  });

  test('an unknown route on any verb renders the error envelope', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      const res = await h.request(method, '/no/such/route', { cookie: user.cookie });
      h.expectError(res, 404, 'NOT_FOUND');
    }
  });

  test('every id in every response is a 26-char ULID', async () => {
    const l = await h.createL(user.id);
    await h.post(`/ls/${l.id}/comments`, { cookie: user.cookie, body: { body: 'hi' } });
    const collection = await h.post('/collections', { cookie: user.cookie, body: { title: 'c' } });

    const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    const responses = [
      (await h.get(`/ls/${l.id}`)).body,
      (await h.get('/feed')).body.data[0],
      (await h.get(`/ls/${l.id}/comments`)).body.data[0],
      collection.body,
      (await h.get('/users/probe')).body,
    ];

    for (const body of responses) {
      assert.match(body.id, ULID, `non-ULID id: ${body.id}`);
    }
  });

  test('all timestamps are ISO-8601 UTC strings', async () => {
    const l = await h.createL(user.id);
    const detail = (await h.get(`/ls/${l.id}`)).body;

    for (const field of ['createdAt']) {
      assert.match(
        detail[field],
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
        `${field} is not ISO UTC: ${detail[field]}`,
      );
    }
  });

  test('single resources are returned bare; lists are always wrapped', async () => {
    const l = await h.createL(user.id);

    const single = await h.get(`/ls/${l.id}`);
    assert.equal(single.body.data, undefined, 'a single resource has no envelope');
    assert.equal(single.body.id, l.id);

    const list = await h.get('/feed');
    assert.ok(Array.isArray(list.body.data));
  });

  test('CORS is locked to the configured web origin, with credentials', async () => {
    const res = await fetch(`${h.ctx.baseUrl}/meta/enums`, {
      headers: { origin: h.WEB_URL },
    });
    assert.equal(res.headers.get('access-control-allow-origin'), h.WEB_URL);
    assert.equal(res.headers.get('access-control-allow-credentials'), 'true');

    const hostile = await fetch(`${h.ctx.baseUrl}/meta/enums`, {
      headers: { origin: 'https://evil.example.com' },
    });
    assert.notEqual(
      hostile.headers.get('access-control-allow-origin'),
      'https://evil.example.com',
      'the API must never echo an arbitrary origin',
    );
    assert.notEqual(hostile.headers.get('access-control-allow-origin'), '*');

    const preflight = await fetch(`${h.ctx.baseUrl}/auth/me`, {
      method: 'OPTIONS',
      headers: {
        origin: h.WEB_URL,
        'access-control-request-method': 'GET',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('cache-control'), PRIVATE_NO_STORE);
  });

  test('mutation responses return the affected resource so the FE need not refetch', async () => {
    const l = await h.createL(user.id);

    const reaction = await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
    assert.ok(reaction.body.reactions && reaction.body.viewer, 'reaction returns summary + viewer');

    const patched = await h.patch(`/ls/${l.id}`, { cookie: user.cookie, body: { title: 'new' } });
    assert.equal(patched.body.title, 'new', 'patch returns the updated resource');

    const other = await h.createUser({ username: 'other' });
    const followed = await h.put('/users/other/follow', { cookie: user.cookie });
    assert.ok(followed.body.counts, 'follow returns the target counts');
    void other;
  });
});
