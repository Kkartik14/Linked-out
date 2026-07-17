'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const h = require('../_harness.cjs');

/**
 * Contract §0: every v2 route treats a presented-but-invalid credential as a 401, and only an
 * absent credential as a guest. V1's optional-auth reads keep the opposite (lenient) behavior
 * for their live consumers.
 *
 * This exists because the rule shipped unevenly. `/v2/feed` 401'd on a dead session while
 * `/v2/auth/me` answered `200 {user: null}` — so a client asking "am I signed in?" was told
 * "no, you're a guest" instead of "your session expired, refresh it", and never refreshed.
 * Seven v2 reads had inherited v1's lenient guard. Route-by-route, because the guard is
 * route-level metadata and a new v2 read reaching for the wrong guard is exactly the mistake
 * this catches.
 */

let routes;

function v2(pathname, cookie) {
  return h.request('GET', pathname, { baseUrl: h.ctx.v2BaseUrl, cookie });
}

describe('23 · v2 authentication uniformity (contract §0)', () => {
  beforeEach(async () => {
    await h.resetDb();

    const author = await h.createUser({ username: 'author' });
    const l = await h.createL(author.id, { visibility: 'PUBLIC' });
    const comment = await h.ctx.prisma.comment.create({
      data: { lId: l.id, authorId: author.id, body: 'A top-level comment.' },
    });
    const collection = await h.ctx.prisma.collection.create({
      data: { ownerId: author.id, title: 'Rejections', slug: 'rejections' },
    });

    // Every v2 route whose authentication is optional. A guest (no cookie) must be served; a
    // bad credential must be rejected. Kept explicit rather than derived from the route table
    // so this test fails loudly when a v2 read is added without a decision about its guard.
    routes = [
      '/auth/me',
      '/feed',
      '/feed/sidebar',
      `/ls/${l.id}`,
      `/ls/${l.id}/comments`,
      `/comments/${comment.id}/replies`,
      `/collections/${collection.id}`,
      '/users/author',
      '/users/author/ls',
      '/users/author/journey',
      '/users/author/followers',
      '/users/author/following',
      '/users/author/collections',
    ];
  });

  test('a forged credential is 401 UNAUTHENTICATED on every optional-auth v2 read', async () => {
    const victim = await h.createUser({ username: 'victim' });

    for (const pathname of routes) {
      h.expectError(await v2(pathname, h.forgedAccessCookie(victim)), 401, 'UNAUTHENTICATED');
    }
  });

  test('an expired credential is 401 TOKEN_EXPIRED on every optional-auth v2 read', async () => {
    const victim = await h.createUser({ username: 'victim' });

    for (const pathname of routes) {
      h.expectError(await v2(pathname, h.expiredAccessCookie(victim)), 401, 'TOKEN_EXPIRED');
    }
  });

  test('an absent credential is still served as a guest on every optional-auth v2 read', async () => {
    for (const pathname of routes) {
      const res = await v2(pathname);
      assert.equal(res.status, 200, `${pathname} serves a guest: got ${res.status}`);
    }
  });

  test('GET /v2/auth/me agrees with the rest of v2 rather than reporting a dead session as guest', async () => {
    const user = await h.createUser({ username: 'kartik' });

    // The exact asymmetry that was reported: same cookie, two answers.
    for (const cookie of [h.forgedAccessCookie(user), h.expiredAccessCookie(user)]) {
      const [me, feed] = await Promise.all([v2('/auth/me', cookie), v2('/feed', cookie)]);
      assert.equal(
        me.status,
        feed.status,
        `/v2/auth/me (${me.status}) and /v2/feed (${feed.status}) must agree on the same credential`,
      );
      assert.notEqual(me.body.user, null, 'a rejected credential is an error, not a null user');
    }

    // A real session is unaffected.
    const live = await v2('/auth/me', user.cookie);
    assert.equal(live.status, 200);
    assert.equal(live.body.user.username, 'kartik');
  });

  test('v1 optional-auth reads keep the lenient downgrade their live consumers depend on', async () => {
    const user = await h.createUser({ username: 'v1user' });

    for (const cookie of [h.forgedAccessCookie(user), h.expiredAccessCookie(user)]) {
      for (const pathname of ['/auth/me', '/users/author', '/users/author/collections']) {
        const res = await h.get(pathname, { cookie });
        assert.equal(res.status, 200, `v1 ${pathname} degrades to guest rather than 401`);
      }
      const me = await h.get('/auth/me', { cookie });
      assert.equal(me.body.user, null, 'v1 /auth/me reports a bad credential as logged out');
    }
  });
});
