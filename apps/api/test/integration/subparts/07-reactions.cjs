'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { reactionResultSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const ALL_TYPES = ['BEEN_THERE', 'HELPFUL', 'RESPECT', 'PAIN', 'SAVED'];
/** popularityScore weights, guarded against runtime/seed drift by seed-policy.test.cjs */
const WEIGHTS = { BEEN_THERE: 2, HELPFUL: 3, RESPECT: 2, PAIN: 1, SAVED: 0 };

describe('07 · reactions (contract §4.5)', () => {
  let author;
  let reactor;
  let l;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    reactor = await h.createUser({ username: 'reactor' });
    l = await h.createL(author.id);
  });

  test('PUT adds a reaction and returns the updated summary + viewer state', async () => {
    const res = await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: reactor.cookie });
    const result = h.expectShape(res, reactionResultSchema, 200);

    assert.equal(result.reactions.total, 1);
    assert.equal(result.reactions.beenThere, 1);
    assert.deepEqual(result.viewer.reactions, ['BEEN_THERE']);
  });

  test('every reaction type increments its own counter and the total', async () => {
    for (const type of ALL_TYPES) {
      await h.put(`/ls/${l.id}/reactions/${type}`, { cookie: reactor.cookie });
    }
    const res = await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: reactor.cookie });

    assert.deepEqual(res.body.reactions, {
      total: 5,
      beenThere: 1,
      helpful: 1,
      respect: 1,
      pain: 1,
      saved: 1,
    });
    assert.deepEqual(res.body.viewer.reactions.sort(), [...ALL_TYPES].sort());
  });

  test('PUT is idempotent — a double-tap never errors and never double-counts', async () => {
    const first = await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });
    const second = await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });

    assert.equal(second.status, 200);
    h.expectShape(second, reactionResultSchema);
    assert.deepEqual(second.body, first.body);
    assert.equal(second.body.reactions.helpful, 1);
  });

  test('DELETE is idempotent — removing an absent reaction returns 200 with the summary', async () => {
    const res = await h.del(`/ls/${l.id}/reactions/RESPECT`, { cookie: reactor.cookie });
    h.expectShape(res, reactionResultSchema, 200);

    assert.equal(res.body.reactions.total, 0);
    assert.deepEqual(res.body.viewer.reactions, []);

    const again = await h.del(`/ls/${l.id}/reactions/RESPECT`, { cookie: reactor.cookie });
    assert.equal(again.status, 200);
  });

  test('add then remove returns the counters to zero', async () => {
    await h.put(`/ls/${l.id}/reactions/PAIN`, { cookie: reactor.cookie });
    const res = await h.del(`/ls/${l.id}/reactions/PAIN`, { cookie: reactor.cookie });

    assert.equal(res.body.reactions.total, 0);
    assert.equal(res.body.reactions.pain, 0);
    assert.deepEqual(res.body.viewer.reactions, []);
  });

  test('DELETE removes an existing reaction after visibility narrows', async () => {
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });
    await h.patch(`/ls/${l.id}`, {
      cookie: author.cookie,
      body: { visibility: 'PRIVATE' },
    });

    const res = await h.del(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });
    h.expectShape(res, reactionResultSchema, 200);
    assert.equal(res.body.reactions.helpful, 0);
    assert.deepEqual(res.body.viewer.reactions, []);
  });

  test('reactions from different users accumulate independently', async () => {
    const other = await h.createUser({ username: 'other' });
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: reactor.cookie });
    const res = await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: other.cookie });

    assert.equal(res.body.reactions.beenThere, 2);
    assert.deepEqual(res.body.viewer.reactions, ['BEEN_THERE'], 'viewer state is per-caller');
  });

  test('popularityScore moves by the documented per-type weight', async () => {
    for (const type of ALL_TYPES) {
      const before = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
      await h.put(`/ls/${l.id}/reactions/${type}`, { cookie: reactor.cookie });
      const after = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });

      assert.equal(
        after.popularityScore - before.popularityScore,
        WEIGHTS[type],
        `${type} should move popularityScore by ${WEIGHTS[type]}`,
      );
    }
  });

  test('un-reacting restores the popularityScore exactly', async () => {
    const before = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });
    await h.del(`/ls/${l.id}/reactions/HELPFUL`, { cookie: reactor.cookie });
    const after = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });

    assert.equal(after.popularityScore, before.popularityScore);
  });

  test('requires authentication', async () => {
    h.expectError(await h.put(`/ls/${l.id}/reactions/HELPFUL`), 401, 'UNAUTHENTICATED');
    h.expectError(await h.del(`/ls/${l.id}/reactions/HELPFUL`), 401, 'UNAUTHENTICATED');
  });

  test('rejects an unknown reaction type with VALIDATION_ERROR', async () => {
    const res = await h.put(`/ls/${l.id}/reactions/LIKE`, { cookie: reactor.cookie });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].code, 'invalid_enum');
  });

  test('reacting to a missing L is 404 L_NOT_FOUND', async () => {
    const res = await h.put('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV/reactions/HELPFUL', {
      cookie: reactor.cookie,
    });
    h.expectError(res, 404, 'L_NOT_FOUND');
  });

  test('reacting to an L the viewer cannot see is 404 — no existence leak', async () => {
    const hidden = await h.createL(author.id, { visibility: 'PRIVATE' });
    h.expectError(
      await h.put(`/ls/${hidden.id}/reactions/HELPFUL`, { cookie: reactor.cookie }),
      404,
      'L_NOT_FOUND',
    );
    h.expectError(
      await h.del(`/ls/${hidden.id}/reactions/HELPFUL`, { cookie: reactor.cookie }),
      404,
      'L_NOT_FOUND',
    );
  });

  test('a follower may react to a FOLLOWERS-visibility L', async () => {
    const restricted = await h.createL(author.id, { visibility: 'FOLLOWERS' });
    await h.follow(reactor.id, author.id);

    const res = await h.put(`/ls/${restricted.id}/reactions/RESPECT`, { cookie: reactor.cookie });
    h.expectShape(res, reactionResultSchema);
  });

  test('the author may react to their own PRIVATE L', async () => {
    const priv = await h.createL(author.id, { visibility: 'PRIVATE' });
    const res = await h.put(`/ls/${priv.id}/reactions/SAVED`, { cookie: author.cookie });
    h.expectShape(res, reactionResultSchema);
  });

  test('the SAVED reaction drives /me/saved and carries no popularity weight', async () => {
    const before = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    await h.put(`/ls/${l.id}/reactions/SAVED`, { cookie: reactor.cookie });
    const after = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });

    assert.equal(after.popularityScore, before.popularityScore, 'saving is private, not a signal');

    const saved = await h.get('/me/saved', { cookie: reactor.cookie });
    assert.deepEqual(saved.body.data.map((c) => c.id), [l.id]);
  });
});
