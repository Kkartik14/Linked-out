'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lDetailSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

describe('05 · PATCH & DELETE /ls/:id (contract §4.3)', () => {
  let owner;
  let stranger;

  beforeEach(async () => {
    await h.resetDb();
    owner = await h.createUser({ username: 'owner' });
    stranger = await h.createUser({ username: 'stranger' });
  });

  test('the owner can patch a single field, leaving the rest untouched', async () => {
    const l = await h.createL(owner.id, { title: 'Before', story: 'Unchanged' });
    const res = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { title: 'After' },
    });
    const updated = h.expectShape(res, lDetailSchema);

    assert.equal(updated.title, 'After');
    assert.equal(updated.story, 'Unchanged');
  });

  test('a non-owner gets 403 NOT_L_OWNER', async () => {
    const l = await h.createL(owner.id);
    const res = await h.patch(`/ls/${l.id}`, {
      cookie: stranger.cookie,
      body: { title: 'Hijacked' },
    });
    h.expectError(res, 403, 'NOT_L_OWNER');

    const untouched = await h.get(`/ls/${l.id}`);
    assert.equal(untouched.body.title, l.title);
  });

  test('patching a missing L is 404 L_NOT_FOUND', async () => {
    const res = await h.patch('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV', {
      cookie: owner.cookie,
      body: { title: 'x' },
    });
    h.expectError(res, 404, 'L_NOT_FOUND');
  });

  test('patching requires authentication', async () => {
    const l = await h.createL(owner.id);
    h.expectError(await h.patch(`/ls/${l.id}`, { body: { title: 'x' } }), 401, 'UNAUTHENTICATED');
  });

  test('visibility and anonymity can be toggled by the owner', async () => {
    const l = await h.createL(owner.id);
    const res = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { visibility: 'PRIVATE', isAnonymous: true },
    });
    const updated = h.expectShape(res, lDetailSchema);

    assert.equal(updated.visibility, 'PRIVATE');
    assert.equal(updated.isAnonymous, true);
    assert.equal(updated.author, null);
  });

  // ─── Battles / resolvedAt (contract FE review #6) ───────────────────────────

  test('a BATTLE can be resolved and reopened via resolvedAt', async () => {
    const l = await h.createL(owner.id, { type: 'BATTLE' });
    assert.equal((await h.get(`/ls/${l.id}`)).body.resolvedAt, null, 'battles start ongoing');

    const resolved = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { resolvedAt: '2026-06-01T00:00:00.000Z' },
    });
    assert.equal(resolved.body.resolvedAt, '2026-06-01T00:00:00.000Z');

    const reopened = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { resolvedAt: null },
    });
    assert.equal(reopened.body.resolvedAt, null);
  });

  test('resolvedAt is forced to null on non-BATTLE types', async () => {
    const l = await h.createL(owner.id, { type: 'STORY' });
    const res = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { resolvedAt: '2026-06-01T00:00:00.000Z' },
    });
    assert.equal(res.body.resolvedAt, null, 'only BATTLE carries a resolvedAt');
  });

  test('changing a resolved BATTLE to another type clears resolvedAt', async () => {
    const l = await h.createL(owner.id, {
      type: 'BATTLE',
      resolvedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const res = await h.patch(`/ls/${l.id}`, { cookie: owner.cookie, body: { type: 'STORY' } });

    assert.equal(res.body.type, 'STORY');
    assert.equal(res.body.resolvedAt, null);
  });

  test('changing another type into a BATTLE accepts its initial resolvedAt', async () => {
    const l = await h.createL(owner.id, { type: 'STORY' });
    const res = await h.patch(`/ls/${l.id}`, {
      cookie: owner.cookie,
      body: { type: 'BATTLE', resolvedAt: '2026-06-01T00:00:00.000Z' },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.type, 'BATTLE');
    assert.equal(res.body.resolvedAt, '2026-06-01T00:00:00.000Z');
  });

  test('an unrelated patch on a resolved BATTLE preserves resolvedAt', async () => {
    const l = await h.createL(owner.id, {
      type: 'BATTLE',
      resolvedAt: new Date('2026-06-01T00:00:00.000Z'),
    });
    const res = await h.patch(`/ls/${l.id}`, { cookie: owner.cookie, body: { title: 'Renamed' } });
    assert.equal(res.body.resolvedAt, '2026-06-01T00:00:00.000Z');
  });

  // ─── Reputation bookkeeping on type change ─────────────────────────────────

  test('changing type moves reputation between storiesShared and lessonsShared', async () => {
    const created = await h.post('/ls', {
      cookie: owner.cookie,
      body: { title: 't', story: 's', type: 'STORY' },
    });
    let profile = await h.get('/users/owner');
    assert.equal(profile.body.reputation.storiesShared, 1);
    assert.equal(profile.body.reputation.lessonsShared, 0);

    await h.patch(`/ls/${created.body.id}`, { cookie: owner.cookie, body: { type: 'LESSON' } });
    profile = await h.get('/users/owner');
    assert.equal(profile.body.reputation.storiesShared, 0, 'STORY credit is withdrawn');
    assert.equal(profile.body.reputation.lessonsShared, 1, 'LESSON credit is granted');
    assert.equal(profile.body.reputation.lsShared, 1, 'lsShared is unchanged by a type change');
  });

  // ─── Delete ────────────────────────────────────────────────────────────────

  test('the owner can delete their L', async () => {
    const l = await h.createL(owner.id);
    const res = await h.del(`/ls/${l.id}`, { cookie: owner.cookie });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    h.expectError(await h.get(`/ls/${l.id}`), 404, 'L_NOT_FOUND');
  });

  test('a non-owner cannot delete, and a missing L is 404', async () => {
    const l = await h.createL(owner.id);
    h.expectError(await h.del(`/ls/${l.id}`, { cookie: stranger.cookie }), 403, 'NOT_L_OWNER');
    h.expectError(
      await h.del('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV', { cookie: owner.cookie }),
      404,
      'L_NOT_FOUND',
    );
  });

  test('deleting an L withdraws its reputation credit', async () => {
    const created = await h.post('/ls', {
      cookie: owner.cookie,
      body: { title: 't', story: 's', type: 'STORY' },
    });
    await h.del(`/ls/${created.body.id}`, { cookie: owner.cookie });

    const { body } = await h.get('/users/owner');
    assert.equal(body.reputation.lsShared, 0);
    assert.equal(body.reputation.storiesShared, 0);
  });

  test('deleting an L cascades its reactions and comments', async () => {
    const l = await h.createL(owner.id);
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: stranger.cookie });
    await h.post(`/ls/${l.id}/comments`, { cookie: stranger.cookie, body: { body: 'hi' } });

    await h.del(`/ls/${l.id}`, { cookie: owner.cookie });

    assert.equal(await h.ctx.prisma.reaction.count({ where: { lId: l.id } }), 0);
    assert.equal(await h.ctx.prisma.comment.count({ where: { lId: l.id } }), 0);
  });

  test('an empty PATCH /ls/:id is rejected (CONTRACT-01 non-empty PATCH)', async () => {
    const owner = await h.createUser();
    const target = await h.createL(owner.id);
    h.expectError(
      await h.patch(`/ls/${target.id}`, { cookie: owner.cookie, body: {} }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('an unknown field on PATCH /ls/:id is rejected and names the bad key', async () => {
    const owner = await h.createUser();
    const target = await h.createL(owner.id);
    const res = await h.patch(`/ls/${target.id}`, { cookie: owner.cookie, body: { titel: 'typo' } });
    h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.ok(
      res.body.error.details?.some((d) => d.field.includes('titel')),
      'the error detail must name the unknown field, not use an empty path',
    );
  });
});
