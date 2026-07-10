'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lDetailSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

describe('04 · GET /ls/:id — visibility matrix (contract §4.3)', () => {
  let owner;
  let follower;
  let stranger;

  beforeEach(async () => {
    await h.resetDb();
    owner = await h.createUser({ username: 'owner' });
    follower = await h.createUser({ username: 'follower' });
    stranger = await h.createUser({ username: 'stranger' });
    await h.follow(follower.id, owner.id);
  });

  const viewers = () => ({
    anonymous: undefined,
    owner: owner.cookie,
    follower: follower.cookie,
    stranger: stranger.cookie,
  });

  test('PUBLIC Ls are visible to everyone', async () => {
    const l = await h.createL(owner.id, { visibility: 'PUBLIC' });
    for (const [who, cookie] of Object.entries(viewers())) {
      const res = await h.get(`/ls/${l.id}`, { cookie });
      h.expectShape(res, lDetailSchema);
      assert.equal(res.body.id, l.id, `${who} should see a PUBLIC L`);
    }
  });

  test('FOLLOWERS Ls are visible only to the owner and their followers', async () => {
    const l = await h.createL(owner.id, { visibility: 'FOLLOWERS' });

    h.expectShape(await h.get(`/ls/${l.id}`, { cookie: owner.cookie }), lDetailSchema);
    h.expectShape(await h.get(`/ls/${l.id}`, { cookie: follower.cookie }), lDetailSchema);

    h.expectError(await h.get(`/ls/${l.id}`), 404, 'L_NOT_FOUND');
    h.expectError(await h.get(`/ls/${l.id}`, { cookie: stranger.cookie }), 404, 'L_NOT_FOUND');
  });

  test('a follow edge is directional — the owner following the viewer grants nothing', async () => {
    const l = await h.createL(owner.id, { visibility: 'FOLLOWERS' });
    await h.follow(owner.id, stranger.id); // owner follows stranger, not the reverse
    h.expectError(await h.get(`/ls/${l.id}`, { cookie: stranger.cookie }), 404, 'L_NOT_FOUND');
  });

  test('PRIVATE Ls are visible only to the owner', async () => {
    const l = await h.createL(owner.id, { visibility: 'PRIVATE' });

    h.expectShape(await h.get(`/ls/${l.id}`, { cookie: owner.cookie }), lDetailSchema);

    h.expectError(await h.get(`/ls/${l.id}`), 404, 'L_NOT_FOUND');
    h.expectError(await h.get(`/ls/${l.id}`, { cookie: follower.cookie }), 404, 'L_NOT_FOUND');
    h.expectError(await h.get(`/ls/${l.id}`, { cookie: stranger.cookie }), 404, 'L_NOT_FOUND');
  });

  test('an invisible L is indistinguishable from a missing one (no existence leak)', async () => {
    const hidden = await h.createL(owner.id, { visibility: 'PRIVATE' });
    const missing = await h.get('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV');
    const forbidden = await h.get(`/ls/${hidden.id}`, { cookie: stranger.cookie });

    assert.equal(missing.status, forbidden.status);
    assert.deepEqual(missing.body, forbidden.body);
  });

  test('a malformed id yields 404, never a 500', async () => {
    for (const id of ['not-a-ulid', '../../etc/passwd', '%20', '1']) {
      const res = await h.get(`/ls/${encodeURIComponent(id)}`);
      h.expectError(res, 404, 'L_NOT_FOUND');
    }
  });

  test('viewer.canEdit is true only for the owner', async () => {
    const l = await h.createL(owner.id);

    const asOwner = await h.get(`/ls/${l.id}`, { cookie: owner.cookie });
    assert.equal(asOwner.body.viewer.canEdit, true);

    const asStranger = await h.get(`/ls/${l.id}`, { cookie: stranger.cookie });
    assert.equal(asStranger.body.viewer.canEdit, false);

    const asAnon = await h.get(`/ls/${l.id}`);
    assert.equal(asAnon.body.viewer.canEdit, false);
  });

  test('viewer.reactions reflects only the calling viewer', async () => {
    const l = await h.createL(owner.id);
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: stranger.cookie });
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: stranger.cookie });

    const asStranger = await h.get(`/ls/${l.id}`, { cookie: stranger.cookie });
    assert.deepEqual(asStranger.body.viewer.reactions.sort(), ['BEEN_THERE', 'SAVED']);

    const asOwner = await h.get(`/ls/${l.id}`, { cookie: owner.cookie });
    assert.deepEqual(asOwner.body.viewer.reactions, []);

    const asAnon = await h.get(`/ls/${l.id}`);
    assert.deepEqual(asAnon.body.viewer.reactions, []);
  });

  test('LDetail carries the full story; feed cards carry a truncated preview', async () => {
    const story = 'A'.repeat(500);
    const l = await h.createL(owner.id, { story });

    const detail = await h.get(`/ls/${l.id}`);
    assert.equal(detail.body.story, story);
    assert.equal(detail.body.storyPreview, undefined, 'LDetail has no storyPreview');

    const feed = await h.get('/feed');
    const card = feed.body.data.find((c) => c.id === l.id);
    assert.equal(card.story, undefined, 'LCard has no full story');
    assert.ok(card.storyPreview.length <= 281, 'preview is truncated to ~280 chars');
    assert.ok(card.storyPreview.endsWith('…'), 'truncated previews end with an ellipsis');
  });

  test('a short story is previewed verbatim with no ellipsis', async () => {
    const l = await h.createL(owner.id, { story: 'Short and complete.' });
    const feed = await h.get('/feed');
    const card = feed.body.data.find((c) => c.id === l.id);
    assert.equal(card.storyPreview, 'Short and complete.');
  });

  test('LDetail lists the collections the L belongs to', async () => {
    const l = await h.createL(owner.id);
    const created = await h.post('/collections', {
      cookie: owner.cookie,
      body: { title: 'Google Interview Journey' },
    });
    await h.put(`/collections/${created.body.id}/ls/${l.id}`, { cookie: owner.cookie });

    const detail = await h.get(`/ls/${l.id}`, { cookie: owner.cookie });
    const parsed = h.expectShape(detail, lDetailSchema);
    assert.equal(parsed.collections.length, 1);
    assert.equal(parsed.collections[0].title, 'Google Interview Journey');
    assert.equal(parsed.collections[0].slug, 'google-interview-journey');
  });
});
