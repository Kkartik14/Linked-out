'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { fieldErrorCodeSchema, lDetailSchema, notificationSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

/**
 * Counters are denormalized and written in the same transaction as their trigger
 * (CLAUDE.md §3). If that transaction is not race-safe, counts silently drift and the
 * frontend renders numbers that never converge. These tests hammer the write paths
 * concurrently and then reconcile every counter against the source-of-truth rows.
 */
describe('20 · counter integrity under concurrency', () => {
  let author;
  let l;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    l = await h.createL(author.id);
  });

  const makeUsers = (n) =>
    Promise.all(Array.from({ length: n }, (_, i) => h.createUser({ username: `u${i}` })));

  test('concurrent reactions from many users produce an exact reactionCount', async () => {
    const users = await makeUsers(12);
    await Promise.all(
      users.map((u) => h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: u.cookie })),
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'BEEN_THERE' } });

    assert.equal(actual, 12, 'every reaction row was written');
    assert.equal(row.beenThereCount, 12, 'beenThereCount must match the rows');
    assert.equal(row.reactionCount, 12, 'reactionCount must match the rows');
    assert.equal(row.trendingScore, 12 * 2, 'trendingScore must match the weights');
  });

  test('the same user double-firing a reaction concurrently still counts once', async () => {
    const user = await h.createUser({ username: 'doubletap' });
    await Promise.all([
      h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
      h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
      h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
    ]);

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const rows = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'HELPFUL' } });

    assert.equal(rows, 1);
    assert.equal(row.helpfulCount, 1, 'an idempotent PUT must never double-count');
    assert.equal(row.reactionCount, 1);
  });

  test('concurrent add + remove of the same reaction converges to a consistent state', async () => {
    const user = await h.createUser({ username: 'flipper' });
    await h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie });

    await Promise.all([
      h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
      h.del(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
      h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
    ]);

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const rows = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'RESPECT' } });

    assert.equal(row.respectCount, rows, 'the counter always equals the row count');
    assert.equal(row.reactionCount, rows);
    assert.equal(row.trendingScore, rows * 2);
  });

  test('concurrent comments produce an exact commentCount', async () => {
    const users = await makeUsers(10);
    await Promise.all(
      users.map((u) => h.post(`/ls/${l.id}/comments`, { cookie: u.cookie, body: { body: 'me too' } })),
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.comment.count({ where: { lId: l.id } });

    assert.equal(actual, 10);
    assert.equal(row.commentCount, 10);
    assert.equal(row.trendingScore, 10 * 2);
  });

  test('concurrent comment deletions leave commentCount exact', async () => {
    const users = await makeUsers(6);
    const comments = await Promise.all(
      users.map((u) => h.post(`/ls/${l.id}/comments`, { cookie: u.cookie, body: { body: 'x' } })),
    );

    await Promise.all(
      comments
        .slice(0, 3)
        .map((c, i) => h.del(`/comments/${c.body.id}`, { cookie: users[i].cookie })),
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.comment.count({ where: { lId: l.id } });

    assert.equal(actual, 3);
    assert.equal(row.commentCount, 3);
  });

  test('concurrent HELPFUL reactions produce an exact buildersHelped', async () => {
    const users = await makeUsers(10);
    await Promise.all(users.map((u) => h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: u.cookie })));

    const profile = await h.ctx.prisma.user.findUnique({ where: { id: author.id } });
    assert.equal(profile.buildersHelped, 10);
  });

  test('concurrent follows of one target produce exact follower counts', async () => {
    const target = await h.createUser({ username: 'target' });
    const users = await makeUsers(10);

    await Promise.all(users.map((u) => h.put('/users/target/follow', { cookie: u.cookie })));

    const res = await h.get('/users/target');
    const edges = await h.ctx.prisma.follow.count({ where: { followingId: target.id } });

    assert.equal(edges, 10);
    assert.equal(res.body.counts.followers, 10);
  });

  test('the same user follow-spamming concurrently creates exactly one edge', async () => {
    await h.createUser({ username: 'target' });
    const user = await h.createUser({ username: 'spammer' });

    await Promise.all(
      Array.from({ length: 5 }, () => h.put('/users/target/follow', { cookie: user.cookie })),
    );

    const res = await h.get('/users/target');
    assert.equal(res.body.counts.followers, 1);

    const notifications = await h.ctx.prisma.notification.count({ where: { type: 'NEW_FOLLOWER' } });
    assert.equal(notifications, 1, 'an idempotent follow must not spam notifications');
  });

  test('concurrent Ls from one author produce an exact lsShared', async () => {
    const spammer = await h.createUser({ username: 'prolific' });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        h.post('/ls', { cookie: spammer.cookie, body: { title: `t${i}`, story: 's', type: 'STORY' } }),
      ),
    );

    const profile = await h.get('/users/prolific');
    assert.equal(profile.body.reputation.lsShared, 10);
    assert.equal(profile.body.reputation.storiesShared, 10);
  });

  test('concurrent collection adds keep positions dense and unique', async () => {
    const collection = await h.post('/collections', {
      cookie: author.cookie,
      body: { title: 'race' },
    });
    const ls = await Promise.all(
      Array.from({ length: 6 }, (_, i) => h.createL(author.id, { title: `L${i}` })),
    );

    await Promise.all(
      ls.map((item) =>
        h.put(`/collections/${collection.body.id}/ls/${item.id}`, { cookie: author.cookie }),
      ),
    );

    const rows = await h.ctx.prisma.collectionL.findMany({
      where: { collectionId: collection.body.id },
      orderBy: { position: 'asc' },
    });

    assert.equal(rows.length, 6, 'every L was added exactly once');
    assert.deepEqual(
      rows.map((r) => r.position),
      [0, 1, 2, 3, 4, 5],
      'positions stay a dense, collision-free sequence',
    );
  });

  test('concurrent folded reactions still produce exactly one notification', async () => {
    const users = await makeUsers(8);
    await Promise.all(
      users.map((u) => h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: u.cookie })),
    );

    const count = await h.ctx.prisma.notification.count({ where: { recipientId: author.id } });
    assert.equal(count, 1, 'the dedupeKey must hold under concurrency');

    const res = await h.get('/notifications', { cookie: author.cookie });
    assert.equal(res.body.data[0].message, '8 builders related to your story.');
  });
});

describe('21 · nullable relations & coercion edges', () => {
  let author;
  let actor;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    actor = await h.createUser({ username: 'actor', name: 'Grace' });
  });

  test('a notification whose actor deleted their account renders with actor: null', async () => {
    await h.put('/users/author/follow', { cookie: actor.cookie });
    await h.ctx.prisma.user.delete({ where: { id: actor.id } });

    const res = await h.get('/notifications', { cookie: author.cookie });
    const page = h.expectShape(res, paginatedSchema(notificationSchema));

    assert.equal(page.data.length, 1);
    assert.equal(page.data[0].actor, null, 'actor is SetNull on delete');
    assert.equal(page.data[0].message, 'Someone started following your journey.');
  });

  test('a COMMENT notification with a deleted actor falls back to "Someone"', async () => {
    const l = await h.createL(author.id);
    await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: 'hi' } });
    await h.ctx.prisma.user.delete({ where: { id: actor.id } });

    const res = await h.get('/notifications', { cookie: author.cookie });
    assert.equal(res.body.data.length, 1, 'comments cascade but the notification survives');
    assert.equal(res.body.data[0].message, 'Someone commented on your L.');
  });

  test('a user with no display name is summarised by username', async () => {
    const nameless = await h.createUser({ username: 'nameless', name: null });
    const l = await h.createL(nameless.id);

    const res = await h.get(`/ls/${l.id}`);
    const detail = h.expectShape(res, lDetailSchema);
    assert.equal(detail.author.name, null);
    assert.equal(detail.author.username, 'nameless');
    assert.equal(detail.author.image, null);
    assert.equal(detail.author.status, null);
  });

  test('eventDate accepts full ISO timestamps and bare dates alike', async () => {
    for (const eventDate of ['2026-05-10', '2026-05-10T13:45:00.000Z', '2026-05-10T13:45:00Z']) {
      const res = await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 't', story: 's', eventDate },
      });
      const detail = h.expectShape(res, lDetailSchema, 201);
      assert.equal(detail.eventDate, new Date(eventDate).toISOString());
    }
  });

  test('an unparseable eventDate is a 400 with a stable field-error code', async () => {
    for (const eventDate of ['yesterday', '2026-13-45', 'NaN', '']) {
      const res = await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 't', story: 's', eventDate },
      });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      assert.equal(error.details[0].field, 'eventDate');
      assert.ok(
        fieldErrorCodeSchema.safeParse(error.details[0].code).success,
        `unstable code ${error.details[0].code} — the FE switches on this`,
      );
    }
  });

  test('a non-date eventDate is rejected, never coerced into an epoch date', async () => {
    // Regression: `z.coerce.date()` ran `new Date(value)` on anything, so `true` was
    // silently stored as 1970-01-01T00:00:00.001Z, `12345` as an epoch offset, and
    // numeric-looking strings like "1" as implementation-defined dates.
    for (const eventDate of [true, false, 12345, 0, '12345', '1', {}, []]) {
      const res = await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 't', story: 's', eventDate },
      });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      assert.equal(error.details[0].field, 'eventDate');
    }

    assert.equal(await h.ctx.prisma.l.count(), 0, 'nothing was persisted');
  });

  test('a non-date resolvedAt is rejected on PATCH too', async () => {
    const battle = await h.createL(author.id, { type: 'BATTLE' });
    for (const resolvedAt of [true, 12345, '12345', '1', 'someday']) {
      const res = await h.patch(`/ls/${battle.id}`, {
        cookie: author.cookie,
        body: { resolvedAt },
      });
      h.expectError(res, 400, 'VALIDATION_ERROR');
    }

    const row = await h.ctx.prisma.l.findUnique({ where: { id: battle.id } });
    assert.equal(row.resolvedAt, null, 'the battle stayed ongoing');
  });

  test('a far-future or far-past eventDate round-trips intact', async () => {
    for (const eventDate of ['1970-01-01', '2999-12-31']) {
      const res = await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 't', story: 's', eventDate },
      });
      assert.equal(h.expectShape(res, lDetailSchema, 201).eventDate, new Date(eventDate).toISOString());
    }
  });

  test('unicode, emoji and newlines survive a create → read round-trip', async () => {
    const story = 'Ла́йк 🔥\nnew line\ttab "quote" <script>alert(1)</script>';
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: { title: '日本語のタイトル 🎌', story, tags: ['タグ', '🔥'] },
    });
    const created = h.expectShape(res, lDetailSchema, 201);

    assert.equal(created.title, '日本語のタイトル 🎌');
    assert.equal(created.story, story, 'the story is stored verbatim, never escaped or stripped');
    assert.deepEqual(created.tags, ['タグ', '🔥']);

    const fetched = await h.get(`/ls/${created.id}`);
    assert.equal(fetched.body.story, story);
  });

  test('title length is counted in UTF-16 code units, exactly as the FE’s own zod check', async () => {
    // Both sides validate with the same schema from @linkedout/contracts, so an emoji
    // (a surrogate pair) costs 2 on the client and 2 on the server. What matters is that
    // the two never disagree — a client-side pass must not become a server-side reject.
    h.expectError(
      await h.post('/ls', { cookie: author.cookie, body: { title: 'a'.repeat(141), story: 's' } }),
      400,
      'VALIDATION_ERROR',
    );

    assert.equal('🎌'.repeat(70).length, 140, 'a surrogate pair costs 2 code units');
    h.expectShape(
      await h.post('/ls', { cookie: author.cookie, body: { title: '🎌'.repeat(70), story: 's' } }),
      lDetailSchema,
      201,
    );
    h.expectError(
      await h.post('/ls', { cookie: author.cookie, body: { title: '🎌'.repeat(71), story: 's' } }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('an unknown body field is ignored rather than persisted or rejected', async () => {
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: { title: 't', story: 's', isAdmin: true, reactionCount: 9999 },
    });
    const created = h.expectShape(res, lDetailSchema, 201);
    assert.equal(created.reactions.total, 0, 'counters can never be set from the wire');
  });

  test('counter fields cannot be injected through PATCH either', async () => {
    const l = await h.createL(author.id);
    await h.patch(`/ls/${l.id}`, {
      cookie: author.cookie,
      body: { title: 'ok', reactionCount: 500, trendingScore: 999, authorId: actor.id },
    });

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    assert.equal(row.reactionCount, 0);
    assert.equal(row.trendingScore, 0);
    assert.equal(row.authorId, author.id, 'ownership can never be reassigned from the wire');
  });
});
