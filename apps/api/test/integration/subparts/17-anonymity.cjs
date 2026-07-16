'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');

const h = require('../_harness.cjs');

/**
 * Anonymity is server-enforced (CLAUDE.md §3): when `isAnonymous`, the mapper sets
 * `author: null` in EVERY response — even to the author themselves and their followers.
 * This subpart sweeps every surface that can carry an author.
 */
describe('17 · anonymity is absolute across every surface (contract §3)', () => {
  let author;
  let follower;
  let stranger;
  let anon;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    follower = await h.createUser({ username: 'follower' });
    stranger = await h.createUser({ username: 'stranger' });
    await h.follow(follower.id, author.id);
    anon = await h.createL(author.id, {
      title: 'my anonymous burnout',
      story: 'anonymous burnout story',
      isAnonymous: true,
      category: 'CAREER',
    });
  });

  const everyViewer = () => [
    ['anonymous visitor', undefined],
    ['the author themselves', author.cookie],
    ['a follower', follower.cookie],
    ['a stranger', stranger.cookie],
  ];

  test('GET /ls/:id hides the author from every viewer', async () => {
    for (const [who, cookie] of everyViewer()) {
      const res = await h.get(`/ls/${anon.id}`, { cookie });
      assert.equal(res.body.author, null, `author leaked to ${who}`);
      assert.equal(res.body.isAnonymous, true);
    }
  });

  test('GET /feed hides the author from every viewer', async () => {
    for (const [who, cookie] of everyViewer()) {
      const res = await h.get('/feed', { cookie });
      const card = res.body.data.find((c) => c.id === anon.id);
      assert.equal(card.author, null, `author leaked in the feed to ${who}`);
    }
  });

  test('GET /feed/following hides the author', async () => {
    const res = await h.get('/feed/following', { cookie: follower.cookie });
    const card = res.body.data.find((c) => c.id === anon.id);
    assert.equal(card.author, null);
  });

  test('author-owned profile surfaces expose an anonymous L only to its author', async () => {
    const ownerLs = await h.get('/users/author/ls', { cookie: author.cookie });
    assert.equal(ownerLs.body.data.find((c) => c.id === anon.id).author, null);
    const ownerJourney = await h.get('/users/author/journey', { cookie: author.cookie });
    assert.ok(ownerJourney.body.data.some((node) => node.id === anon.id));

    for (const [who, cookie] of everyViewer().filter(([label]) => label !== 'the author themselves')) {
      const ls = await h.get('/users/author/ls', { cookie });
      assert.ok(!ls.body.data.some((card) => card.id === anon.id), `profile associated the anonymous L with ${who}`);
      const journey = await h.get('/users/author/journey', { cookie });
      assert.ok(!journey.body.data.some((node) => node.id === anon.id), `journey associated the anonymous L with ${who}`);
    }
  });

  test('GET /search hides the author', async () => {
    for (const [who, cookie] of everyViewer()) {
      const res = await h.get('/search?q=burnout', { cookie });
      const card = res.body.data.find((c) => c.id === anon.id);
      assert.ok(card, 'the anonymous L is still discoverable');
      assert.equal(card.author, null, `author leaked in search to ${who}`);
    }
  });

  test('collection membership cannot re-attribute an anonymous L', async () => {
    const collection = await h.post('/collections', {
      cookie: author.cookie,
      body: { title: 'Anonymous stories' },
    });
    await h.put(`/collections/${collection.body.id}/ls/${anon.id}`, { cookie: author.cookie });

    const ownerL = await h.get(`/ls/${anon.id}`, { cookie: author.cookie });
    assert.equal(ownerL.body.collections[0].id, collection.body.id, 'the owner retains collection controls');
    const ownerCollection = await h.get(`/collections/${collection.body.id}`, { cookie: author.cookie });
    assert.equal(ownerCollection.body.ls[0].id, anon.id);

    for (const [who, cookie] of everyViewer().filter(([label]) => label !== 'the author themselves')) {
      const l = await h.get(`/ls/${anon.id}`, { cookie });
      assert.deepEqual(l.body.collections, [], `L detail exposed an attributive collection to ${who}`);
      const res = await h.get(`/collections/${collection.body.id}`, { cookie });
      assert.ok(!res.body.ls.some((card) => card.id === anon.id), `collection associated the anonymous L with ${who}`);
      assert.equal(res.body.lCount, 0, `collection count revealed a hidden anonymous member to ${who}`);
    }
  });

  test('GET /me/saved hides the author of a saved anonymous L', async () => {
    await h.put(`/ls/${anon.id}/reactions/SAVED`, { cookie: stranger.cookie });
    const res = await h.get('/me/saved', { cookie: stranger.cookie });
    assert.equal(res.body.data[0].author, null);
  });

  test('a mutation response (PATCH /ls/:id) hides the author from its own author', async () => {
    const res = await h.patch(`/ls/${anon.id}`, {
      cookie: author.cookie,
      body: { title: 'still anonymous' },
    });
    assert.equal(res.body.author, null);
    assert.equal(res.body.viewer.canEdit, true, 'the author keeps edit rights');
  });

  test('turning an existing L anonymous retroactively hides its author', async () => {
    const named = await h.createL(author.id, { title: 'named story' });
    assert.equal((await h.get(`/ls/${named.id}`)).body.author.username, 'author');

    await h.patch(`/ls/${named.id}`, { cookie: author.cookie, body: { isAnonymous: true } });
    assert.equal((await h.get(`/ls/${named.id}`)).body.author, null);
  });

  test('turning an anonymous L public restores its author', async () => {
    await h.patch(`/ls/${anon.id}`, { cookie: author.cookie, body: { isAnonymous: false } });
    const res = await h.get(`/ls/${anon.id}`);
    assert.equal(res.body.author.username, 'author');
  });

  test('the anonymous author still receives notifications for their L', async () => {
    await h.put(`/ls/${anon.id}/reactions/BEEN_THERE`, { cookie: stranger.cookie });
    const res = await h.get('/notifications', { cookie: author.cookie });

    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].target.lId, anon.id);
    assert.equal(res.body.data[0].actor.username, 'stranger', 'the reactor is not anonymous');
  });

  test('an anonymous L still counts toward the author’s public reputation', async () => {
    const created = await h.post('/ls', {
      cookie: author.cookie,
      body: { title: 't', story: 's', type: 'STORY', isAnonymous: true },
    });
    assert.equal(created.body.author, null);

    const profile = await h.get('/users/author');
    assert.equal(profile.body.reputation.storiesShared, 1, 'reputation is aggregate, not attributive');
  });

  test('no response anywhere embeds the author’s username alongside an anonymous L', async () => {
    const surfaces = [`/ls/${anon.id}`, '/feed', '/search?q=burnout'];
    for (const path of surfaces) {
      const res = await h.get(path, { cookie: follower.cookie });
      const serialized = JSON.stringify(res.body);
      const payload = JSON.parse(serialized);
      const nodes = payload.data ?? [payload];
      const target = nodes.find((n) => n.id === anon.id);
      assert.ok(target, `expected the anonymous L on ${path}`);
      assert.ok(
        !('author' in target) || target.author === null,
        `${path} exposed an author object for an anonymous L`,
      );
    }
  });
});
