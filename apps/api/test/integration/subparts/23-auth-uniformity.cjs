'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const h = require('../_harness.cjs');

/**
 * Every optional-auth route treats a presented-but-invalid credential as a 401, and only an
 * absent credential as a guest. This explicit route list makes a newly-added read require a
 * deliberate authentication decision.
 */

let routes;

function optionalRead(pathname, cookie) {
  return h.get(pathname, { cookie });
}

describe('23 · authentication uniformity (contract §0)', () => {
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

    // Every route whose authentication is optional. A guest (no cookie) must be served; a
    // bad credential must be rejected. Kept explicit rather than derived from the route table
    // so this test fails loudly when a read is added without a decision about its guard.
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
      '/users/author/followers',
      '/users/author/following',
      '/users/author/collections',
    ];
  });

  test('a forged credential is 401 UNAUTHENTICATED on every optional-auth read', async () => {
    const victim = await h.createUser({ username: 'victim' });

    for (const pathname of routes) {
      h.expectError(await optionalRead(pathname, h.forgedAccessCookie(victim)), 401, 'UNAUTHENTICATED');
    }
  });

  test('an expired credential is 401 TOKEN_EXPIRED on every optional-auth read', async () => {
    const victim = await h.createUser({ username: 'victim' });

    for (const pathname of routes) {
      h.expectError(await optionalRead(pathname, h.expiredAccessCookie(victim)), 401, 'TOKEN_EXPIRED');
    }
  });

  test('a presented invalid internal assertion is never downgraded on optional-auth reads', async () => {
    for (const pathname of routes) {
      const res = await h.request('GET', pathname, {
        headers: { 'x-internal-auth': 'not-an-assertion' },
      });
      h.expectError(res, 401, 'UNAUTHENTICATED');
    }
  });

  test('an absent credential is still served as a guest on every optional-auth read', async () => {
    for (const pathname of routes) {
      const res = await optionalRead(pathname);
      assert.equal(res.status, 200, `${pathname} serves a guest: got ${res.status}`);
    }
  });

  test('GET /v1/auth/me agrees with the rest of the API for the same credential', async () => {
    const user = await h.createUser({ username: 'kartik' });

    // The exact asymmetry that was reported: same cookie, two answers.
    for (const cookie of [h.forgedAccessCookie(user), h.expiredAccessCookie(user)]) {
      const [me, feed] = await Promise.all([
        optionalRead('/auth/me', cookie),
        optionalRead('/feed', cookie),
      ]);
      assert.equal(
        me.status,
        feed.status,
        `/v1/auth/me (${me.status}) and /v1/feed (${feed.status}) must agree on the same credential`,
      );
      assert.notEqual(me.body.user, null, 'a rejected credential is an error, not a null user');
    }

    // A real session is unaffected.
    const live = await optionalRead('/auth/me', user.cookie);
    assert.equal(live.status, 200);
    assert.equal(live.body.user.username, 'kartik');
  });

});
