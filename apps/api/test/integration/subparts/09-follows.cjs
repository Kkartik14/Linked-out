'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { followResultSchema, userSummarySchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const summaryList = paginatedSchema(userSummarySchema);

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

  test('GET followers/following return paginated UserSummary lists', async () => {
    await h.put('/users/target/follow', { cookie: me.cookie });

    const followers = await h.get('/users/target/followers');
    const page = h.expectShape(followers, summaryList);
    assert.deepEqual(page.data.map((u) => u.username), ['mine']);

    const following = await h.get('/users/mine/following');
    const page2 = h.expectShape(following, summaryList);
    assert.deepEqual(page2.data.map((u) => u.username), ['target']);
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
    const page1 = h.expectShape(first, summaryList);
    assert.equal(page1.data.length, 2);

    const second = await h.get(
      `/users/target/followers?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
    );
    const page2 = h.expectShape(second, summaryList);

    const overlap = page1.data.filter((a) => page2.data.some((b) => b.id === a.id));
    assert.equal(overlap.length, 0);
    assert.equal(page1.data[0].username, 'f4', 'newest follow first');
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
