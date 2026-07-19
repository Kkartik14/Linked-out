'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { journeyNodeSchema, lCardSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const journeySchema = paginatedSchema(journeyNodeSchema);
const savedSchema = paginatedSchema(lCardSchema);
const iso = (s) => new Date(s);

describe('14 · L Journey (contract §4.2, FE review #4)', () => {
  let me;
  let other;

  beforeEach(async () => {
    await h.resetDb();
    me = await h.createUser({ username: 'mine' });
    other = await h.createUser({ username: 'other' });
  });

  test('returns JourneyNodes oldest → newest by createdAt', async () => {
    const late = await h.createL(me.id, { title: 'late' });
    const early = await h.createL(me.id, { title: 'early' });
    const middle = await h.createL(me.id, { title: 'middle' });
    await Promise.all([
      h.ctx.prisma.l.update({ where: { id: late.id }, data: { createdAt: iso('2026-06-01') } }),
      h.ctx.prisma.l.update({ where: { id: early.id }, data: { createdAt: iso('2020-01-01') } }),
      h.ctx.prisma.l.update({ where: { id: middle.id }, data: { createdAt: iso('2023-03-03') } }),
    ]);

    const res = await h.get('/users/mine/journey');
    const page = h.expectShape(res, journeySchema);

    assert.deepEqual(page.data.map((n) => n.id), [early.id, middle.id, late.id]);
  });

  test('createdAt is the sole journey timestamp', async () => {
    const l = await h.createL(me.id);
    const res = await h.get('/users/mine/journey');
    const node = h.expectShape(res, journeySchema).data.find((item) => item.id === l.id);
    assert.equal(node.createdAt, l.createdAt.toISOString());
    assert.equal('date' in node, false);
    assert.equal('eventDate' in node, false);
  });

  test('Ls sharing a createdAt fall back to a stable id ordering', async () => {
    const same = iso('2024-04-04');
    const a = await h.createL(me.id, { title: 'a' });
    const b = await h.createL(me.id, { title: 'b' });
    await h.ctx.prisma.l.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { createdAt: same } });

    const res = await h.get('/users/mine/journey');
    assert.deepEqual(res.body.data.map((n) => n.id), [a.id, b.id], 'ties break by id asc');
  });

  test('journey nodes carry battle state and engagement totals', async () => {
    const battle = await h.createL(me.id, {
      type: 'BATTLE',
      resolvedAt: iso('2026-02-02'),
      counters: { reactionCount: 5, commentCount: 2 },
    });

    const res = await h.get('/users/mine/journey');
    const node = h.expectShape(res, journeySchema).data.find((n) => n.id === battle.id);

    assert.equal(node.type, 'BATTLE');
    assert.equal(node.resolvedAt, '2026-02-02T00:00:00.000Z');
    assert.equal(node.reactionTotal, 5);
    assert.equal(node.commentCount, 2);
  });

  test('journey respects visibility per viewer', async () => {
    const pub = await h.createL(me.id, { visibility: 'PUBLIC' });
    const followersOnly = await h.createL(me.id, { visibility: 'FOLLOWERS' });
    await h.createL(me.id, { visibility: 'PRIVATE' });

    assert.deepEqual((await h.get('/users/mine/journey')).body.data.map((n) => n.id), [pub.id]);
    assert.equal((await h.get('/users/mine/journey', { cookie: me.cookie })).body.data.length, 3);

    await h.follow(other.id, me.id);
    const follower = await h.get('/users/mine/journey', { cookie: other.cookie });
    assert.deepEqual(
      follower.body.data.map((n) => n.id).sort(),
      [pub.id, followersOnly.id].sort(),
    );
  });

  test('journey defaults to 30 per page and caps at 100', async () => {
    h.expectShape(await h.get('/users/mine/journey?limit=100'), journeySchema);
    h.expectError(await h.get('/users/mine/journey?limit=101'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/users/mine/journey?limit=0'), 400, 'VALIDATION_ERROR');
  });

  test('journey paginates ascending without gaps or duplicates', async () => {
    for (let i = 0; i < 7; i += 1) {
      const l = await h.createL(me.id, { title: `n${i}` });
      await h.ctx.prisma.l.update({
        where: { id: l.id },
        data: { createdAt: iso(`2020-01-0${i + 1}`) },
      });
    }

    const seen = [];
    let cursor;
    let guard = 0;
    do {
      const q = `/users/mine/journey?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = h.expectShape(await h.get(q), journeySchema);
      seen.push(...page.data.map((n) => n.id));
      cursor = page.nextCursor;
      guard += 1;
      assert.ok(guard < 10, 'pagination must terminate');
    } while (cursor);

    assert.equal(seen.length, 7);
    assert.equal(new Set(seen).size, 7);

    const dates = seen.map((_, i) => i);
    assert.deepEqual(dates, [...dates].sort((a, b) => a - b), 'ascending across pages');
  });

  test('journey pages correctly across Ls that share the same createdAt', async () => {
    const same = iso('2024-04-04');
    const created = [];
    for (let i = 0; i < 5; i += 1) created.push(await h.createL(me.id));
    await h.ctx.prisma.l.updateMany({
      where: { id: { in: created.map((l) => l.id) } },
      data: { createdAt: same },
    });

    const first = h.expectShape(await h.get('/users/mine/journey?limit=2'), journeySchema);
    const second = h.expectShape(
      await h.get(`/users/mine/journey?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`),
      journeySchema,
    );
    const third = h.expectShape(
      await h.get(`/users/mine/journey?limit=2&cursor=${encodeURIComponent(second.nextCursor)}`),
      journeySchema,
    );

    const seen = [...first.data, ...second.data, ...third.data].map((n) => n.id);
    assert.equal(new Set(seen).size, 5, 'identical timestamps must not cause skips or repeats');
    assert.deepEqual(seen, created.map((l) => l.id));
  });

  test('journey of an unknown user is 404, and a bad cursor is BAD_CURSOR', async () => {
    h.expectError(await h.get('/users/ghost/journey'), 404, 'USER_NOT_FOUND');
    h.expectError(await h.get('/users/mine/journey?cursor=%2Fbad'), 400, 'BAD_CURSOR');
  });

  test('an anonymous L appears in the journey only for its author', async () => {
    const anon = await h.createL(me.id, { isAnonymous: true });
    const outsider = h.expectShape(await h.get('/users/mine/journey'), journeySchema);
    assert.equal(outsider.data.some((node) => node.id === anon.id), false);

    const own = await h.get('/users/mine/journey', { cookie: me.cookie });
    const node = h.expectShape(own, journeySchema).data.find((n) => n.id === anon.id);

    assert.equal(node.isAnonymous, true);
    assert.equal(node.author, undefined, 'JourneyNode carries no author at all');
  });
});

describe('15 · GET /me/saved (contract §4.5)', () => {
  let me;
  let author;

  beforeEach(async () => {
    await h.resetDb();
    me = await h.createUser({ username: 'mine' });
    author = await h.createUser({ username: 'author' });
  });

  test('requires authentication', async () => {
    h.expectError(await h.get('/me/saved'), 401, 'UNAUTHENTICATED');
  });

  test('lists the viewer’s SAVED Ls, most recently saved first', async () => {
    const first = await h.createL(author.id, { title: 'first' });
    const second = await h.createL(author.id, { title: 'second' });

    await h.put(`/ls/${first.id}/reactions/SAVED`, { cookie: me.cookie });
    await h.put(`/ls/${second.id}/reactions/SAVED`, { cookie: me.cookie });

    const res = await h.get('/me/saved', { cookie: me.cookie });
    const page = h.expectShape(res, savedSchema);
    assert.deepEqual(page.data.map((c) => c.id), [second.id, first.id]);
  });

  test('only SAVED counts — other reactions do not fill the list', async () => {
    const l = await h.createL(author.id);
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: me.cookie });

    const res = await h.get('/me/saved', { cookie: me.cookie });
    assert.deepEqual(res.body.data, []);
  });

  test('un-saving removes the L from the list', async () => {
    const l = await h.createL(author.id);
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });
    await h.del(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });

    assert.deepEqual((await h.get('/me/saved', { cookie: me.cookie })).body.data, []);
  });

  test('an L that later turns PRIVATE disappears from the saved list', async () => {
    const l = await h.createL(author.id, { visibility: 'PUBLIC' });
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });
    assert.equal((await h.get('/me/saved', { cookie: me.cookie })).body.data.length, 1);

    await h.patch(`/ls/${l.id}`, { cookie: author.cookie, body: { visibility: 'PRIVATE' } });
    assert.deepEqual(
      (await h.get('/me/saved', { cookie: me.cookie })).body.data,
      [],
      'saving does not grant lasting access',
    );
  });

  test('a saved FOLLOWERS L stays visible while the follow lasts', async () => {
    await h.follow(me.id, author.id);
    const l = await h.createL(author.id, { visibility: 'FOLLOWERS' });
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });

    assert.equal((await h.get('/me/saved', { cookie: me.cookie })).body.data.length, 1);

    await h.del('/users/author/follow', { cookie: me.cookie });
    assert.deepEqual((await h.get('/me/saved', { cookie: me.cookie })).body.data, []);
  });

  test('one user’s saved list never leaks into another’s', async () => {
    const l = await h.createL(author.id);
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });

    assert.deepEqual((await h.get('/me/saved', { cookie: author.cookie })).body.data, []);
  });

  test('saved paginates without overlap and rejects a bad cursor', async () => {
    for (let i = 0; i < 5; i += 1) {
      const l = await h.createL(author.id, { title: `L${i}` });
      await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: me.cookie });
    }

    const first = h.expectShape(await h.get('/me/saved?limit=2', { cookie: me.cookie }), savedSchema);
    const second = h.expectShape(
      await h.get(`/me/saved?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`, {
        cookie: me.cookie,
      }),
      savedSchema,
    );

    const overlap = first.data.filter((a) => second.data.some((b) => b.id === a.id));
    assert.equal(overlap.length, 0);

    h.expectError(await h.get('/me/saved?cursor=%2Fbad', { cookie: me.cookie }), 400, 'BAD_CURSOR');
  });
});
