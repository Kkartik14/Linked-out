'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const { authMeResponseSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

function internalHeader(assertion) {
  return { 'x-internal-auth': assertion };
}

describe('24 · private BFF assertion trust boundary', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('a valid internal assertion authenticates required and optional routes', async () => {
    const user = await h.createUser({ username: 'internal_user' });
    const headers = internalHeader(h.internalAssertion(user));

    const required = await h.get('/notifications/unread-count', { headers });
    assert.equal(required.status, 200);
    assert.deepEqual(required.body, { count: 0 });

    const optional = await h.get('/auth/me', { headers });
    const body = h.expectShape(optional, authMeResponseSchema);
    assert.equal(body.user.username, 'internal_user');
  });

  test('a valid internal identity wins over a conflicting legacy cookie', async () => {
    const internalUser = await h.createUser({ username: 'internal_user' });
    const legacyUser = await h.createUser({ username: 'legacy_user' });
    const res = await h.get('/auth/me', {
      cookie: legacyUser.cookie,
      headers: internalHeader(h.internalAssertion(internalUser)),
    });
    const body = h.expectShape(res, authMeResponseSchema);
    assert.equal(body.user.username, 'internal_user');
  });

  test('invalid internal assertions never fall back to a valid legacy cookie', async () => {
    const user = await h.createUser({ username: 'legacy_user' });
    const wrongSecret = 'wrong-internal-secret-0123456789abcdef';
    const forged = h.internalAssertion(user, { secret: wrongSecret });

    for (const pathname of ['/auth/me', '/notifications/unread-count']) {
      h.expectError(
        await h.get(pathname, {
          cookie: user.cookie,
          headers: internalHeader(forged),
        }),
        401,
        'UNAUTHENTICATED',
      );
    }
    h.expectError(
      await h.get('/auth/me', {
        cookie: user.cookie,
        headers: internalHeader(''),
      }),
      401,
      'UNAUTHENTICATED',
    );
    h.expectError(
      await h.get('/auth/me', {
        cookie: user.cookie,
        headers: internalHeader(h.authExchangeAssertion()),
      }),
      401,
      'UNAUTHENTICATED',
    );
  });

  test('expired internal assertions stay expired even beside a valid legacy cookie', async () => {
    const user = await h.createUser();
    const issuedLongAgo = new Date(Date.now() - 61_000);
    const expired = h.internalAssertion(user, { now: issuedLongAgo });
    h.expectError(
      await h.get('/notifications/unread-count', {
        cookie: user.cookie,
        headers: internalHeader(expired),
      }),
      401,
      'TOKEN_EXPIRED',
    );
  });

  test('an assertion for a deleted subject is rejected rather than trusted blindly', async () => {
    const user = await h.createUser();
    const assertion = h.internalAssertion(user);
    await h.ctx.prisma.user.delete({ where: { id: user.id } });
    h.expectError(
      await h.get('/notifications/unread-count', { headers: internalHeader(assertion) }),
      401,
      'UNAUTHENTICATED',
    );
  });
});
