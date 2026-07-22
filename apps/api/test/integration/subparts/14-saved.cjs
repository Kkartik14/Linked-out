'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lCardSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const savedSchema = paginatedSchema(lCardSchema);

describe('14 · GET /me/saved (contract §4.5)', () => {
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
