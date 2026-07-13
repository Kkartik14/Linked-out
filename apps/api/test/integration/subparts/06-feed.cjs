'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lCardSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const feedSchema = paginatedSchema(lCardSchema);
const ids = (res) => res.body.data.map((c) => c.id);

describe('06 · GET /feed — global feed (contract §4.4)', () => {
  let author;
  let viewer;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    viewer = await h.createUser({ username: 'viewer' });
  });

  test('is public and returns the paginated LCard envelope', async () => {
    await h.createL(author.id);
    const res = await h.get('/feed');
    const page = h.expectShape(res, feedSchema);

    assert.equal(page.data.length, 1);
    assert.equal(page.nextCursor, null, 'a short page ends with a null cursor');
  });

  test('an empty feed is a valid empty page, not a 404', async () => {
    const res = await h.get('/feed');
    const page = h.expectShape(res, feedSchema);
    assert.deepEqual(page.data, []);
    assert.equal(page.nextCursor, null);
  });

  test('exposes only PUBLIC Ls — never FOLLOWERS or PRIVATE, even to a follower', async () => {
    const pub = await h.createL(author.id, { visibility: 'PUBLIC' });
    await h.createL(author.id, { visibility: 'FOLLOWERS' });
    await h.createL(author.id, { visibility: 'PRIVATE' });
    await h.follow(viewer.id, author.id);

    for (const cookie of [undefined, viewer.cookie, author.cookie]) {
      const res = await h.get('/feed', { cookie });
      assert.deepEqual(ids(res), [pub.id], 'the global feed is PUBLIC-only by design');
    }
  });

  test('sort=latest (the default) is newest-first', async () => {
    const first = await h.createL(author.id, { title: 'first' });
    const second = await h.createL(author.id, { title: 'second' });
    const third = await h.createL(author.id, { title: 'third' });

    assert.deepEqual(ids(await h.get('/feed')), [third.id, second.id, first.id]);
    assert.deepEqual(ids(await h.get('/feed?sort=latest')), [third.id, second.id, first.id]);
  });

  test('sort=popular orders by lifetime popularityScore desc', async () => {
    const low = await h.createL(author.id, { counters: { popularityScore: 1 } });
    const high = await h.createL(author.id, { counters: { popularityScore: 99 } });
    const mid = await h.createL(author.id, { counters: { popularityScore: 50 } });

    assert.deepEqual(ids(await h.get('/feed?sort=popular')), [high.id, mid.id, low.id]);
  });

  test('sort=helpful orders by helpfulCount desc', async () => {
    const low = await h.createL(author.id, { counters: { helpfulCount: 0 } });
    const high = await h.createL(author.id, { counters: { helpfulCount: 42 } });
    const mid = await h.createL(author.id, { counters: { helpfulCount: 7 } });

    assert.deepEqual(ids(await h.get('/feed?sort=helpful')), [high.id, mid.id, low.id]);
  });

  test('filter selects a single lowercase category', async () => {
    const interviews = await h.createL(author.id, { category: 'INTERVIEWS' });
    await h.createL(author.id, { category: 'LAYOFFS' });

    const res = await h.get('/feed?filter=interviews');
    assert.deepEqual(ids(res), [interviews.id]);
  });

  test('every documented category filter is accepted', async () => {
    for (const filter of ['interviews', 'startups', 'layoffs', 'production', 'career', 'learning']) {
      const res = await h.get(`/feed?filter=${filter}`);
      h.expectShape(res, feedSchema);
    }
  });

  test('rejects an unknown sort, filter, or uppercase category', async () => {
    h.expectError(await h.get('/feed?sort=hottest'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?sort=trending'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?filter=INTERVIEWS'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?filter=nonsense'), 400, 'VALIDATION_ERROR');
  });

  test('limit defaults to 20 and is capped at 50', async () => {
    h.expectShape(await h.get('/feed?limit=50'), feedSchema);
    h.expectError(await h.get('/feed?limit=51'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?limit=0'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?limit=-1'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?limit=1.5'), 400, 'VALIDATION_ERROR');
    h.expectError(await h.get('/feed?limit=abc'), 400, 'VALIDATION_ERROR');
  });

  test('paginates without gaps or duplicates across every sort', async () => {
    const created = [];
    for (let i = 0; i < 7; i += 1) {
      created.push(
        await h.createL(author.id, {
          title: `L${i}`,
          counters: { popularityScore: i, helpfulCount: i },
        }),
      );
    }

    for (const sort of ['latest', 'popular', 'helpful']) {
      const seen = [];
      let cursor;
      let guard = 0;
      do {
        const q = `/feed?sort=${sort}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
        const res = await h.get(q);
        const page = h.expectShape(res, feedSchema);
        seen.push(...page.data.map((c) => c.id));
        cursor = page.nextCursor;
        guard += 1;
        assert.ok(guard < 10, 'pagination must terminate');
      } while (cursor);

      assert.equal(seen.length, 7, `${sort}: every L is returned exactly once`);
      assert.equal(new Set(seen).size, 7, `${sort}: no duplicates across pages`);
    }
  });

  test('a cursor from one sort is not silently reused by another', async () => {
    for (let i = 0; i < 3; i += 1) {
      await h.createL(author.id, { counters: { popularityScore: i } });
    }

    const popular = await h.get('/feed?sort=popular&limit=1');
    const cursor = encodeURIComponent(popular.body.nextCursor);
    // A popularity cursor carries {score,id}; the latest sort needs {id}. It must not 500.
    const res = await h.get(`/feed?sort=latest&cursor=${cursor}`);
    assert.ok(res.status === 200 || res.status === 400, `got ${res.status}`);
    if (res.status === 400) h.expectError(res, 400, 'BAD_CURSOR');
  });

  test('a malformed cursor is 400 BAD_CURSOR, never a 500', async () => {
    for (const cursor of ['not-base64', 'eyJib2d1cyI6dHJ1ZX0', btoa('[]'), btoa('null'), btoa('{"id":1}')]) {
      const res = await h.get(`/feed?cursor=${encodeURIComponent(cursor)}`);
      h.expectError(res, 400, 'BAD_CURSOR');
    }
  });

  test('feed cards carry viewer context when signed in, and neutral context when not', async () => {
    const l = await h.createL(author.id);
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: viewer.cookie });

    const asViewer = await h.get('/feed', { cookie: viewer.cookie });
    assert.deepEqual(asViewer.body.data[0].viewer.reactions, ['HELPFUL']);
    assert.equal(asViewer.body.data[0].viewer.canEdit, false);

    const asAuthor = await h.get('/feed', { cookie: author.cookie });
    assert.deepEqual(asAuthor.body.data[0].viewer.reactions, []);
    assert.equal(asAuthor.body.data[0].viewer.canEdit, true);

    const asAnon = await h.get('/feed');
    assert.deepEqual(asAnon.body.data[0].viewer, { reactions: [], canEdit: false });
  });

  test('feed cards expose denormalized reaction counts', async () => {
    const l = await h.createL(author.id);
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: viewer.cookie });
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: viewer.cookie });

    const res = await h.get('/feed');
    assert.deepEqual(res.body.data[0].reactions, {
      total: 2,
      beenThere: 1,
      helpful: 0,
      respect: 0,
      pain: 0,
      saved: 1,
    });
  });
});

describe('06b · GET /feed/following (contract §4.4)', () => {
  let me;
  let followed;
  let unfollowed;

  beforeEach(async () => {
    await h.resetDb();
    me = await h.createUser({ username: 'me' });
    followed = await h.createUser({ username: 'followed' });
    unfollowed = await h.createUser({ username: 'unfollowed' });
    await h.follow(me.id, followed.id);
  });

  test('requires authentication', async () => {
    h.expectError(await h.get('/feed/following'), 401, 'UNAUTHENTICATED');
  });

  test('returns PUBLIC and FOLLOWERS Ls from followed authors only', async () => {
    const pub = await h.createL(followed.id, { visibility: 'PUBLIC' });
    const followersOnly = await h.createL(followed.id, { visibility: 'FOLLOWERS' });
    await h.createL(followed.id, { visibility: 'PRIVATE' });
    await h.createL(unfollowed.id, { visibility: 'PUBLIC' });

    const res = await h.get('/feed/following', { cookie: me.cookie });
    const page = h.expectShape(res, feedSchema);
    const returned = page.data.map((c) => c.id).sort();

    assert.deepEqual(returned, [pub.id, followersOnly.id].sort());
  });

  test("never includes the viewer's own Ls", async () => {
    await h.createL(me.id, { visibility: 'PUBLIC' });
    const theirs = await h.createL(followed.id, { visibility: 'PUBLIC' });

    const res = await h.get('/feed/following', { cookie: me.cookie });
    assert.deepEqual(ids(res), [theirs.id]);
  });

  test('is empty when the viewer follows nobody', async () => {
    await h.createL(unfollowed.id);
    const loner = await h.createUser({ username: 'loner' });

    const res = await h.get('/feed/following', { cookie: loner.cookie });
    assert.deepEqual(ids(res), []);
  });

  test('supports the same sort/filter/pagination params as /feed', async () => {
    await h.createL(followed.id, { category: 'LAYOFFS', counters: { popularityScore: 5 } });
    const career = await h.createL(followed.id, {
      category: 'CAREER',
      counters: { popularityScore: 1 },
    });

    h.expectShape(await h.get('/feed/following?sort=popular', { cookie: me.cookie }), feedSchema);
    h.expectShape(await h.get('/feed/following?sort=helpful', { cookie: me.cookie }), feedSchema);

    const filtered = await h.get('/feed/following?filter=career', { cookie: me.cookie });
    assert.deepEqual(ids(filtered), [career.id]);

    h.expectError(await h.get('/feed/following?sort=bogus', { cookie: me.cookie }), 400, 'VALIDATION_ERROR');
  });

  test('unfollowing immediately removes an author from the following feed', async () => {
    await h.createL(followed.id);
    assert.equal((await h.get('/feed/following', { cookie: me.cookie })).body.data.length, 1);

    await h.del('/users/followed/follow', { cookie: me.cookie });
    assert.equal((await h.get('/feed/following', { cookie: me.cookie })).body.data.length, 0);
  });
});
