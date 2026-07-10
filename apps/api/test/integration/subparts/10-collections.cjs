'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const {
  collectionSchema,
  collectionDetailSchema,
  paginatedSchema,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const listSchema = paginatedSchema(collectionSchema);

describe('10 · collections (contract §4.8)', () => {
  let owner;
  let stranger;

  beforeEach(async () => {
    await h.resetDb();
    owner = await h.createUser({ username: 'owner' });
    stranger = await h.createUser({ username: 'stranger' });
  });

  const create = (title = 'My Startup Journey', cookie = owner.cookie) =>
    h.post('/collections', { cookie, body: { title } });

  test('POST creates a collection with a derived slug and bumps collectionsCreated', async () => {
    const res = await create();
    const collection = h.expectShape(res, collectionSchema, 201);

    assert.equal(collection.title, 'My Startup Journey');
    assert.equal(collection.slug, 'my-startup-journey');
    assert.equal(collection.lCount, 0);
    assert.equal(collection.owner.username, 'owner');
    assert.equal(collection.viewer.canEdit, true);

    const profile = await h.get('/users/owner');
    assert.equal(profile.body.reputation.collectionsCreated, 1);
  });

  test('two collections with the same title get distinct slugs, not a 500', async () => {
    const first = await create('Interview Season');
    const second = await create('Interview Season');

    h.expectShape(second, collectionSchema, 201);
    assert.notEqual(first.body.slug, second.body.slug);
    assert.ok(second.body.slug.startsWith('interview-season'));
  });

  test('a title of only punctuation still yields a usable slug', async () => {
    const res = await create('!!! ???');
    assert.equal(h.expectShape(res, collectionSchema, 201).slug, 'collection');
  });

  test('enforces the 1..80 title limit and requires auth + onboarding', async () => {
    h.expectError(await create(''), 400, 'VALIDATION_ERROR');
    h.expectError(await create('x'.repeat(81)), 400, 'VALIDATION_ERROR');
    h.expectShape(await create('x'.repeat(80)), collectionSchema, 201);

    h.expectError(await h.post('/collections', { body: { title: 'x' } }), 401, 'UNAUTHENTICATED');

    const fresh = await h.createOnboardingUser();
    h.expectError(await create('x', fresh.cookie), 403, 'FORBIDDEN');
  });

  test('GET /collections/:id is public and returns CollectionDetail with ordered Ls', async () => {
    const collection = await create();
    const a = await h.createL(owner.id, { title: 'A' });
    const b = await h.createL(owner.id, { title: 'B' });

    await h.put(`/collections/${collection.body.id}/ls/${a.id}`, { cookie: owner.cookie });
    await h.put(`/collections/${collection.body.id}/ls/${b.id}`, { cookie: owner.cookie });

    const res = await h.get(`/collections/${collection.body.id}`);
    const detail = h.expectShape(res, collectionDetailSchema);

    assert.deepEqual(detail.ls.map((l) => l.title), ['A', 'B'], 'append order is preserved');
    assert.equal(detail.lCount, 2);
    assert.equal(detail.viewer.canEdit, false, 'anonymous viewers cannot edit');
  });

  test('an explicit position reorders the collection', async () => {
    const collection = await create();
    const a = await h.createL(owner.id, { title: 'A' });
    const b = await h.createL(owner.id, { title: 'B' });
    const c = await h.createL(owner.id, { title: 'C' });

    for (const l of [a, b, c]) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }

    const res = await h.put(`/collections/${collection.body.id}/ls/${c.id}`, {
      cookie: owner.cookie,
      body: { position: 0 },
    });
    const detail = h.expectShape(res, collectionDetailSchema);
    assert.deepEqual(detail.ls.map((l) => l.title), ['C', 'A', 'B']);
  });

  test('an appended L always lands last, even after earlier members were removed', async () => {
    // Regression: the append position was derived from a row COUNT, so after removals
    // it collided with a surviving row and the new L jumped ahead of it.
    const collection = await create();
    const [a, b, c, d] = await Promise.all(
      ['A', 'B', 'C', 'D'].map((title) => h.createL(owner.id, { title })),
    );
    const id = collection.body.id;

    for (const l of [a, b, c]) await h.put(`/collections/${id}/ls/${l.id}`, { cookie: owner.cookie });
    await h.del(`/collections/${id}/ls/${a.id}`, { cookie: owner.cookie });
    await h.del(`/collections/${id}/ls/${b.id}`, { cookie: owner.cookie });

    const res = await h.put(`/collections/${id}/ls/${d.id}`, { cookie: owner.cookie });
    const detail = h.expectShape(res, collectionDetailSchema);
    assert.deepEqual(detail.ls.map((l) => l.title), ['C', 'D'], 'D must append after C');
  });

  test('positions stay dense (0..n-1) so ordering never depends on an id tiebreak', async () => {
    const collection = await create();
    const ls = await Promise.all(['A', 'B', 'C'].map((title) => h.createL(owner.id, { title })));
    for (const l of ls) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }
    await h.put(`/collections/${collection.body.id}/ls/${ls[2].id}`, {
      cookie: owner.cookie,
      body: { position: 0 },
    });

    const rows = await h.ctx.prisma.collectionL.findMany({
      where: { collectionId: collection.body.id },
      orderBy: { position: 'asc' },
    });
    assert.deepEqual(rows.map((r) => r.position), [0, 1, 2], 'no duplicate positions');
  });

  test('an out-of-range position clamps to the ends instead of erroring', async () => {
    const collection = await create();
    const ls = await Promise.all(['A', 'B'].map((title) => h.createL(owner.id, { title })));
    for (const l of ls) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }

    const far = await h.put(`/collections/${collection.body.id}/ls/${ls[0].id}`, {
      cookie: owner.cookie,
      body: { position: 999 },
    });
    assert.deepEqual(h.expectShape(far, collectionDetailSchema).ls.map((l) => l.title), ['B', 'A']);
  });

  test('a negative position is rejected by validation', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);
    const res = await h.put(`/collections/${collection.body.id}/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { position: -1 },
    });
    h.expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('re-adding a member without a position leaves its place untouched', async () => {
    const collection = await create();
    const ls = await Promise.all(['A', 'B', 'C'].map((title) => h.createL(owner.id, { title })));
    for (const l of ls) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }

    const res = await h.put(`/collections/${collection.body.id}/ls/${ls[0].id}`, {
      cookie: owner.cookie,
    });
    assert.deepEqual(
      h.expectShape(res, collectionDetailSchema).ls.map((l) => l.title),
      ['A', 'B', 'C'],
      'an idempotent re-add must not move the L to the end',
    );
  });

  test('PUT of an L is idempotent — adding twice keeps one entry', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);

    await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    const res = await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });

    const detail = h.expectShape(res, collectionDetailSchema);
    assert.equal(detail.ls.length, 1);
    assert.equal(detail.lCount, 1);
  });

  test('DELETE of an L is idempotent — removing an absent L returns the detail', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);

    const res = await h.del(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    const detail = h.expectShape(res, collectionDetailSchema);
    assert.equal(detail.ls.length, 0);
  });

  test('only the owner may add, remove, rename, or delete', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);
    const id = collection.body.id;

    h.expectError(await h.put(`/collections/${id}/ls/${l.id}`, { cookie: stranger.cookie }), 403, 'FORBIDDEN');
    h.expectError(await h.del(`/collections/${id}/ls/${l.id}`, { cookie: stranger.cookie }), 403, 'FORBIDDEN');
    h.expectError(
      await h.patch(`/collections/${id}`, { cookie: stranger.cookie, body: { title: 'Hijacked' } }),
      403,
      'FORBIDDEN',
    );
    h.expectError(await h.del(`/collections/${id}`, { cookie: stranger.cookie }), 403, 'FORBIDDEN');
  });

  test('you may only add your OWN Ls to your collection', async () => {
    const collection = await create();
    const theirL = await h.createL(stranger.id);

    const res = await h.put(`/collections/${collection.body.id}/ls/${theirL.id}`, {
      cookie: owner.cookie,
    });
    h.expectError(res, 403, 'FORBIDDEN');
  });

  test('adding a missing L is 404 L_NOT_FOUND', async () => {
    const collection = await create();
    const res = await h.put(`/collections/${collection.body.id}/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV`, {
      cookie: owner.cookie,
    });
    h.expectError(res, 404, 'L_NOT_FOUND');
  });

  test('operating on a missing collection is 404 COLLECTION_NOT_FOUND', async () => {
    const missing = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    h.expectError(await h.get(`/collections/${missing}`), 404, 'COLLECTION_NOT_FOUND');
    h.expectError(
      await h.patch(`/collections/${missing}`, { cookie: owner.cookie, body: { title: 'x' } }),
      404,
      'COLLECTION_NOT_FOUND',
    );
    h.expectError(await h.del(`/collections/${missing}`, { cookie: owner.cookie }), 404, 'COLLECTION_NOT_FOUND');
  });

  test('PATCH renames and re-slugs', async () => {
    const collection = await create('Old Name');
    const res = await h.patch(`/collections/${collection.body.id}`, {
      cookie: owner.cookie,
      body: { title: 'New Name' },
    });
    const renamed = h.expectShape(res, collectionSchema);

    assert.equal(renamed.title, 'New Name');
    assert.equal(renamed.slug, 'new-name');
  });

  test('DELETE removes the collection but never the Ls inside it', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);
    await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });

    const res = await h.del(`/collections/${collection.body.id}`, { cookie: owner.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    h.expectError(await h.get(`/collections/${collection.body.id}`), 404, 'COLLECTION_NOT_FOUND');
    assert.equal((await h.get(`/ls/${l.id}`)).status, 200, 'the L survives');
  });

  test('deleting an L removes it from its collections', async () => {
    const collection = await create();
    const l = await h.createL(owner.id);
    await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });

    await h.del(`/ls/${l.id}`, { cookie: owner.cookie });

    const detail = await h.get(`/collections/${collection.body.id}`);
    assert.deepEqual(detail.body.ls, []);
    assert.equal(detail.body.lCount, 0);
  });

  test('CollectionDetail hides Ls the viewer may not see', async () => {
    const collection = await create();
    const pub = await h.createL(owner.id, { visibility: 'PUBLIC' });
    const priv = await h.createL(owner.id, { visibility: 'PRIVATE' });
    const followersOnly = await h.createL(owner.id, { visibility: 'FOLLOWERS' });

    for (const l of [pub, priv, followersOnly]) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }

    const asOwner = await h.get(`/collections/${collection.body.id}`, { cookie: owner.cookie });
    assert.equal(asOwner.body.ls.length, 3);

    const asAnon = await h.get(`/collections/${collection.body.id}`);
    assert.deepEqual(asAnon.body.ls.map((l) => l.id), [pub.id]);
    assert.equal(asAnon.body.lCount, 1, 'lCount matches what the viewer can actually see');

    const asStranger = await h.get(`/collections/${collection.body.id}`, { cookie: stranger.cookie });
    assert.deepEqual(asStranger.body.ls.map((l) => l.id), [pub.id]);

    await h.follow(stranger.id, owner.id);
    const asFollower = await h.get(`/collections/${collection.body.id}`, { cookie: stranger.cookie });
    assert.deepEqual(
      asFollower.body.ls.map((l) => l.id).sort(),
      [pub.id, followersOnly.id].sort(),
      'followers see FOLLOWERS-visibility Ls',
    );
  });

  test('GET /users/:username/collections lists a user’s collections with viewer-aware lCount', async () => {
    const collection = await create();
    const pub = await h.createL(owner.id, { visibility: 'PUBLIC' });
    const priv = await h.createL(owner.id, { visibility: 'PRIVATE' });
    for (const l of [pub, priv]) {
      await h.put(`/collections/${collection.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    }

    const asAnon = await h.get('/users/owner/collections');
    const page = h.expectShape(asAnon, listSchema);
    assert.equal(page.data[0].lCount, 1, 'private Ls are not counted for strangers');
    assert.equal(page.data[0].viewer.canEdit, false);

    const asOwner = await h.get('/users/owner/collections', { cookie: owner.cookie });
    assert.equal(asOwner.body.data[0].lCount, 2);
    assert.equal(asOwner.body.data[0].viewer.canEdit, true);
  });

  test('collections of an unknown user are 404', async () => {
    h.expectError(await h.get('/users/ghost/collections'), 404, 'USER_NOT_FOUND');
  });

  test('an L detail lists the collections it belongs to', async () => {
    const one = await create('One');
    const two = await create('Two');
    const l = await h.createL(owner.id);

    await h.put(`/collections/${one.body.id}/ls/${l.id}`, { cookie: owner.cookie });
    await h.put(`/collections/${two.body.id}/ls/${l.id}`, { cookie: owner.cookie });

    const detail = await h.get(`/ls/${l.id}`, { cookie: owner.cookie });
    assert.equal(detail.body.collections.length, 2);
    assert.deepEqual(detail.body.collections.map((c) => c.title).sort(), ['One', 'Two']);
  });
});
