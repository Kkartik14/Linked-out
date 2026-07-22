'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const {
  followResultSchema,
  followListUserSchema,
  paginatedSchema,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const followList = paginatedSchema(followListUserSchema);

describe('09 · follows (contract §4.7)', () => {
  let me;
  let target;

  beforeEach(async () => {
    await h.resetDb();
    me = await h.createUser({ username: 'mine' });
    target = await h.createUser({ username: 'target' });
  });

  test('PUT follows and returns the target’s updated counts', async () => {
    const res = await h.put('/users/target/follow', { cookie: me.cookie });
    const result = h.expectShape(res, followResultSchema, 200);

    assert.equal(result.isFollowing, true);
    assert.deepEqual(result.counts, { followers: 1, following: 0 });

    const [meRow, targetRow, edgeCount] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({
        where: { id: me.id },
        select: { followerCount: true, followingCount: true },
      }),
      h.ctx.prisma.user.findUniqueOrThrow({
        where: { id: target.id },
        select: { followerCount: true, followingCount: true },
      }),
      h.ctx.prisma.follow.count({ where: { followerId: me.id, followingId: target.id } }),
    ]);
    assert.equal(edgeCount, 1);
    assert.deepEqual(meRow, { followerCount: 0, followingCount: 1 });
    assert.deepEqual(targetRow, { followerCount: 1, followingCount: 0 });
  });

  test('PUT is idempotent — following twice never errors or double-counts', async () => {
    const first = await h.put('/users/target/follow', { cookie: me.cookie });
    const second = await h.put('/users/target/follow', { cookie: me.cookie });

    assert.equal(second.status, 200);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.body.counts.followers, 1);

    const [meRow, targetRow] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: me.id } }),
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
    ]);
    assert.equal(meRow.followingCount, 1, 'idempotent PUT increments the source once');
    assert.equal(targetRow.followerCount, 1, 'idempotent PUT increments the target once');
  });

  test('DELETE unfollows and is idempotent when not following', async () => {
    await h.put('/users/target/follow', { cookie: me.cookie });

    const first = await h.del('/users/target/follow', { cookie: me.cookie });
    const result = h.expectShape(first, followResultSchema, 200);
    assert.equal(result.isFollowing, false);
    assert.equal(result.counts.followers, 0);

    const second = await h.del('/users/target/follow', { cookie: me.cookie });
    assert.equal(second.status, 200, 'un-following twice must not error');
    assert.equal(second.body.isFollowing, false);

    const [meRow, targetRow, edgeCount] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: me.id } }),
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: target.id } }),
      h.ctx.prisma.follow.count({ where: { followerId: me.id, followingId: target.id } }),
    ]);
    assert.equal(edgeCount, 0);
    assert.equal(meRow.followingCount, 0, 'idempotent DELETE decrements the source once');
    assert.equal(targetRow.followerCount, 0, 'idempotent DELETE decrements the target once');
  });

  test('self-follow is rejected with VALIDATION_ERROR', async () => {
    const res = await h.put('/users/mine/follow', { cookie: me.cookie });
    h.expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('following an unknown user is 404 USER_NOT_FOUND', async () => {
    h.expectError(await h.put('/users/ghost/follow', { cookie: me.cookie }), 404, 'USER_NOT_FOUND');
    h.expectError(await h.del('/users/ghost/follow', { cookie: me.cookie }), 404, 'USER_NOT_FOUND');
  });

  test('following requires authentication', async () => {
    h.expectError(await h.put('/users/target/follow'), 401, 'UNAUTHENTICATED');
    h.expectError(await h.del('/users/target/follow'), 401, 'UNAUTHENTICATED');
  });

  test('profile viewer.isFollowing reflects the edge, and counts stay consistent', async () => {
    let profile = await h.get('/users/target', { cookie: me.cookie });
    assert.equal(profile.body.viewer.isFollowing, false);

    await h.put('/users/target/follow', { cookie: me.cookie });

    profile = await h.get('/users/target', { cookie: me.cookie });
    assert.equal(profile.body.viewer.isFollowing, true);
    assert.equal(profile.body.counts.followers, 1);

    const mine = await h.get('/users/mine', { cookie: me.cookie });
    assert.equal(mine.body.counts.following, 1);
    assert.equal(mine.body.viewer.isSelf, true);
    assert.equal(mine.body.viewer.isFollowing, false, 'isFollowing is false on your own profile');
  });

  test('GET followers/following return follow-list rows with viewer state', async () => {
    await h.put('/users/target/follow', { cookie: me.cookie });

    // 'mine' viewing target's followers finds itself — isSelf, and you never follow yourself.
    const followers = await h.get('/users/target/followers', { cookie: me.cookie });
    const page = h.expectShape(followers, followList);
    assert.deepEqual(
      page.data.map((r) => r.user.username),
      ['mine'],
    );
    assert.deepEqual(page.data[0].viewer, { isFollowing: false, isSelf: true });

    // 'mine' viewing its own following finds target — followed, and not itself.
    const following = await h.get('/users/mine/following', { cookie: me.cookie });
    const page2 = h.expectShape(following, followList);
    assert.deepEqual(
      page2.data.map((r) => r.user.username),
      ['target'],
    );
    assert.deepEqual(page2.data[0].viewer, { isFollowing: true, isSelf: false });
  });

  test('signed-out viewer receives empty follow state on every row', async () => {
    const other = await h.createUser({ username: 'other' });
    await h.follow(me.id, target.id);
    await h.follow(other.id, target.id);

    const followers = await h.get('/users/target/followers');
    const page = h.expectShape(followers, followList);
    assert.equal(page.data.length, 2);
    assert.ok(
      page.data.every((r) => r.viewer.isFollowing === false && r.viewer.isSelf === false),
      'a signed-out viewer follows no one and is no one',
    );
  });

  test('follower rows reflect the signed-in viewer’s own follow edges', async () => {
    const ann = await h.createUser({ username: 'ann' });
    const bob = await h.createUser({ username: 'bob' });
    await h.follow(ann.id, target.id); // ann and bob both follow target
    await h.follow(bob.id, target.id);
    await h.put('/users/ann/follow', { cookie: me.cookie }); // me follows ann, not bob

    const res = await h.get('/users/target/followers', { cookie: me.cookie });
    const page = h.expectShape(res, followList);
    const viewerByName = Object.fromEntries(page.data.map((r) => [r.user.username, r.viewer]));
    assert.deepEqual(viewerByName.ann, { isFollowing: true, isSelf: false });
    assert.deepEqual(viewerByName.bob, { isFollowing: false, isSelf: false });
  });

  test('followers/following of an unknown user are 404', async () => {
    h.expectError(await h.get('/users/ghost/followers'), 404, 'USER_NOT_FOUND');
    h.expectError(await h.get('/users/ghost/following'), 404, 'USER_NOT_FOUND');
  });

  test('follower lists paginate newest-first without overlap', async () => {
    const followers = [];
    for (let i = 0; i < 5; i += 1) {
      const u = await h.createUser({ username: `f${i}` });
      followers.push(u);
      await h.follow(u.id, target.id);
    }

    const first = await h.get('/users/target/followers?limit=2');
    const page1 = h.expectShape(first, followList);
    assert.equal(page1.data.length, 2);

    const second = await h.get(
      `/users/target/followers?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
    );
    const page2 = h.expectShape(second, followList);

    const overlap = page1.data.filter((a) => page2.data.some((b) => b.user.id === a.user.id));
    assert.equal(overlap.length, 0);
    assert.equal(page1.data[0].user.username, 'f4', 'newest follow first');
  });

  test('following a user creates exactly one NEW_FOLLOWER notification, and re-following adds none', async () => {
    await h.put('/users/target/follow', { cookie: me.cookie });
    await h.put('/users/target/follow', { cookie: me.cookie });

    const notifications = await h.get('/notifications', { cookie: target.cookie });
    assert.equal(notifications.body.data.length, 1);
    assert.equal(notifications.body.data[0].type, 'NEW_FOLLOWER');
  });

  test('unfollow then re-follow does not spam a duplicate notification', async () => {
    await h.put('/users/target/follow', { cookie: me.cookie });
    await h.del('/users/target/follow', { cookie: me.cookie });
    await h.put('/users/target/follow', { cookie: me.cookie });

    const notifications = await h.get('/notifications', { cookie: target.cookie });
    assert.equal(notifications.body.data.length, 1);
  });
});
