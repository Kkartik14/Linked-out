'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { lDetailSchema, notificationSchema, paginatedSchema } = require('@linkedout/contracts');

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

  /**
   * `fetch` resolves normally for HTTP 4xx/5xx responses. Assert every concurrent response
   * before inspecting aggregate DB state, otherwise partial failures can masquerade as a
   * concurrency-safe implementation when the final counters merely match the successful subset.
   */
  async function concurrentHttp(requests, expectedStatus, operation) {
    const responses = await Promise.all(requests);
    for (const [index, response] of responses.entries()) {
      assert.equal(
        response.status,
        expectedStatus,
        `${operation} request ${index + 1}/${responses.length} returned ${response.status}: ${JSON.stringify(response.body)}`,
      );
    }
    return responses;
  }

  async function assertFollowCounterParity(userId) {
    const [user, followers, following] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { followerCount: true, followingCount: true },
      }),
      h.ctx.prisma.follow.count({ where: { followingId: userId } }),
      h.ctx.prisma.follow.count({ where: { followerId: userId } }),
    ]);
    assert.equal(user.followerCount, followers, 'persisted followerCount matches Follow edges');
    assert.equal(user.followingCount, following, 'persisted followingCount matches Follow edges');
  }

  test('concurrent reactions from many users produce an exact reactionCount', async () => {
    const users = await makeUsers(12);
    await concurrentHttp(
      users.map((u) => h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: u.cookie })),
      200,
      'add reaction',
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'BEEN_THERE' } });

    assert.equal(actual, 12, 'every reaction row was written');
    assert.equal(row.beenThereCount, 12, 'beenThereCount must match the rows');
    assert.equal(row.reactionCount, 12, 'reactionCount must match the rows');
    assert.equal(row.popularityScore, 12 * 2, 'popularityScore must match the weights');
  });

  test('the same user double-firing a reaction concurrently still counts once', async () => {
    const user = await h.createUser({ username: 'doubletap' });
    await concurrentHttp(
      [
        h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
        h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
        h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie }),
      ],
      200,
      'idempotent add reaction',
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const rows = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'HELPFUL' } });

    assert.equal(rows, 1);
    assert.equal(row.helpfulCount, 1, 'an idempotent PUT must never double-count');
    assert.equal(row.reactionCount, 1);
  });

  test('concurrent add + remove of the same reaction converges to a consistent state', async () => {
    const user = await h.createUser({ username: 'flipper' });
    await h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie });

    await concurrentHttp(
      [
        h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
        h.del(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
        h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: user.cookie }),
      ],
      200,
      'mixed reaction add/remove',
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const rows = await h.ctx.prisma.reaction.count({ where: { lId: l.id, type: 'RESPECT' } });

    assert.equal(row.respectCount, rows, 'the counter always equals the row count');
    assert.equal(row.reactionCount, rows);
    assert.equal(row.popularityScore, rows * 2);
  });

  test('concurrent comments produce an exact commentCount', async () => {
    const users = await makeUsers(10);
    await concurrentHttp(
      users.map((u) => h.post(`/ls/${l.id}/comments`, { cookie: u.cookie, body: { body: 'me too' } })),
      201,
      'create comment',
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.comment.count({ where: { lId: l.id } });

    assert.equal(actual, 10);
    assert.equal(row.commentCount, 10);
    assert.equal(row.popularityScore, 10 * 2);
  });

  test('concurrent comment deletions leave commentCount exact', async () => {
    const users = await makeUsers(6);
    const comments = await concurrentHttp(
      users.map((u) => h.post(`/ls/${l.id}/comments`, { cookie: u.cookie, body: { body: 'x' } })),
      201,
      'create comment before delete race',
    );

    await concurrentHttp(
      comments
        .slice(0, 3)
        .map((c, i) => h.del(`/comments/${c.body.id}`, { cookie: users[i].cookie })),
      200,
      'delete comment',
    );

    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    const actual = await h.ctx.prisma.comment.count({ where: { lId: l.id } });

    assert.equal(actual, 3);
    assert.equal(row.commentCount, 3);
  });

  test('a reply racing its parent deletion cannot leave a ghost counter', async () => {
    const replier = await h.createUser({ username: 'reply-racer' });

    for (let iteration = 0; iteration < 10; iteration += 1) {
      const root = await h.post(`/ls/${l.id}/comments`, {
        cookie: author.cookie,
        body: { body: `root ${iteration}` },
      });
      assert.equal(root.status, 201, JSON.stringify(root.body));

      const [reply, removal] = await Promise.all([
        h.post(`/comments/${root.body.id}/replies`, {
          cookie: replier.cookie,
          body: { body: `racing reply ${iteration}` },
        }),
        h.del(`/comments/${root.body.id}`, { cookie: author.cookie }),
      ]);
      assert.equal(removal.status, 200, `parent delete ${iteration + 1}: ${JSON.stringify(removal.body)}`);
      assert.ok(
        reply.status === 201 || reply.status === 404,
        `reply ${iteration + 1} must either serialize first or see the deleted parent: ${reply.status} ${JSON.stringify(reply.body)}`,
      );
      if (reply.status === 404) h.expectError(reply, 404, 'COMMENT_NOT_FOUND');
    }

    const [row, actual] = await Promise.all([
      h.ctx.prisma.l.findUniqueOrThrow({ where: { id: l.id } }),
      h.ctx.prisma.comment.count({ where: { lId: l.id } }),
    ]);
    assert.equal(actual, 0, 'the parent cascade leaves no raced replies behind');
    assert.equal(row.commentCount, 0, 'commentCount follows the serialized subtree deletes');
    assert.equal(row.popularityScore, 0, 'comment popularity follows the same exact delta');
  });

  test('concurrent HELPFUL reactions produce exact L counters', async () => {
    const users = await makeUsers(10);
    await concurrentHttp(
      users.map((u) => h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: u.cookie })),
      200,
      'add HELPFUL reaction',
    );

    const reacted = await h.ctx.prisma.l.findUniqueOrThrow({ where: { id: l.id } });
    assert.equal(reacted.reactionCount, 10);
    assert.equal(reacted.helpfulCount, 10);
  });

  test('concurrent follows of one target produce exact follower counts', async () => {
    const target = await h.createUser({ username: 'target' });
    const users = await makeUsers(10);

    await concurrentHttp(
      users.map((u) => h.put('/users/target/follow', { cookie: u.cookie })),
      200,
      'follow target',
    );

    const res = await h.get('/users/target');
    const edges = await h.ctx.prisma.follow.count({ where: { followingId: target.id } });

    assert.equal(edges, 10);
    assert.equal(res.body.counts.followers, 10);
    await Promise.all([assertFollowCounterParity(target.id), ...users.map((u) => assertFollowCounterParity(u.id))]);
  });

  test('the same user follow-spamming concurrently creates exactly one edge', async () => {
    await h.createUser({ username: 'target' });
    const user = await h.createUser({ username: 'spammer' });

    await concurrentHttp(
      Array.from({ length: 5 }, () => h.put('/users/target/follow', { cookie: user.cookie })),
      200,
      'idempotent follow',
    );

    const res = await h.get('/users/target');
    assert.equal(res.body.counts.followers, 1);

    const notifications = await h.ctx.prisma.notification.count({ where: { type: 'NEW_FOLLOWER' } });
    assert.equal(notifications, 1, 'an idempotent follow must not spam notifications');
    const target = await h.ctx.prisma.user.findUniqueOrThrow({ where: { username: 'target' } });
    await Promise.all([assertFollowCounterParity(target.id), assertFollowCounterParity(user.id)]);
  });

  test('concurrent follow and unfollow commands always leave both endpoint counters exact', async () => {
    const target = await h.createUser({ username: 'target' });
    const user = await h.createUser({ username: 'edge-flipper' });

    for (let iteration = 0; iteration < 4; iteration += 1) {
      await concurrentHttp(
        [
          h.put('/users/target/follow', { cookie: user.cookie }),
          h.del('/users/target/follow', { cookie: user.cookie }),
          h.put('/users/target/follow', { cookie: user.cookie }),
          h.del('/users/target/follow', { cookie: user.cookie }),
        ],
        200,
        `mixed follow/unfollow iteration ${iteration + 1}`,
      );
      await Promise.all([assertFollowCounterParity(target.id), assertFollowCounterParity(user.id)]);
    }
  });

  test('mutual follow writes lock endpoint counters in one stable order', async () => {
    const left = await h.createUser({ username: 'left' });
    const right = await h.createUser({ username: 'right' });

    await concurrentHttp(
      [
        h.put('/users/right/follow', { cookie: left.cookie }),
        h.put('/users/left/follow', { cookie: right.cookie }),
      ],
      200,
      'mutual follows',
    );

    await Promise.all([assertFollowCounterParity(left.id), assertFollowCounterParity(right.id)]);
    const [leftRow, rightRow] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: left.id } }),
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: right.id } }),
    ]);
    assert.deepEqual(
      [leftRow.followerCount, leftRow.followingCount, rightRow.followerCount, rightRow.followingCount],
      [1, 1, 1, 1],
    );
  });

  test('deleting a user repairs the surviving endpoints of cascaded follow edges', async () => {
    const deleted = await h.createUser({ username: 'deleted' });
    const follower = await h.createUser({ username: 'follower' });
    const followed = await h.createUser({ username: 'followed' });
    await h.put('/users/deleted/follow', { cookie: follower.cookie });
    await h.put('/users/followed/follow', { cookie: deleted.cookie });

    await h.ctx.prisma.user.delete({ where: { id: deleted.id } });

    await Promise.all([assertFollowCounterParity(follower.id), assertFollowCounterParity(followed.id)]);
    const [followerRow, followedRow] = await Promise.all([
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: follower.id } }),
      h.ctx.prisma.user.findUniqueOrThrow({ where: { id: followed.id } }),
    ]);
    assert.equal(followerRow.followingCount, 0);
    assert.equal(followedRow.followerCount, 0);
  });

  test('concurrent Ls from one author produce an exact lsShared', async () => {
    const spammer = await h.createUser({ username: 'prolific' });
    await concurrentHttp(
      Array.from({ length: 10 }, (_, i) =>
        h.post('/ls', { cookie: spammer.cookie, body: { title: `t${i}`, story: 's', type: 'STORY' } }),
      ),
      201,
      'create L',
    );

    const profile = await h.get('/users/prolific');
    assert.equal(profile.body.reputation.lsShared, 10);
    assert.equal(profile.body.reputation.storiesShared, 10);
  });

  test('concurrent folded reactions still produce exactly one notification', async () => {
    const users = await makeUsers(8);
    await concurrentHttp(
      users.map((u) => h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: u.cookie })),
      200,
      'add folded reaction',
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

  test('unicode, emoji and newlines survive a create → read round-trip', async () => {
    const story = 'Ла́йк 🔥\nnew line\ttab "quote" <script>alert(1)</script>';
    const res = await h.post('/ls', {
      cookie: author.cookie,
      body: { title: '日本語のタイトル 🎌', story },
    });
    const created = h.expectShape(res, lDetailSchema, 201);

    assert.equal(created.title, '日本語のタイトル 🎌');
    assert.equal(created.story, story, 'the story is stored verbatim, never escaped or stripped');
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

  test('an unknown body field is rejected, not silently stripped (CONTRACT-01)', async () => {
    // Strict inputs turn mass-assignment attempts into a 400 rather than a quiet strip.
    h.expectError(
      await h.post('/ls', {
        cookie: author.cookie,
        body: { title: 't', story: 's', isAdmin: true, reactionCount: 9999 },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('counter/ownership fields cannot be injected through PATCH — the write is rejected', async () => {
    const l = await h.createL(author.id);
    h.expectError(
      await h.patch(`/ls/${l.id}`, {
        cookie: author.cookie,
        body: { title: 'ok', reactionCount: 500, popularityScore: 999, authorId: actor.id },
      }),
      400,
      'VALIDATION_ERROR',
    );

    // And nothing was persisted: the rejected PATCH left every field untouched.
    const row = await h.ctx.prisma.l.findUnique({ where: { id: l.id } });
    assert.equal(row.reactionCount, 0);
    assert.equal(row.popularityScore, 0);
    assert.equal(row.title, l.title, 'a rejected PATCH must not apply its valid fields either');
    assert.equal(row.authorId, author.id, 'ownership can never be reassigned from the wire');
  });

  test('a misspelled privacy field is rejected instead of defaulting to PUBLIC (CONTRACT-01)', async () => {
    // `visiblity`/`isAnynomous` typos must 400 — never silently publish attributed content.
    for (const body of [
      { title: 'secret', story: 's', visiblity: 'PRIVATE' },
      { title: 'secret', story: 's', isAnynomous: true },
    ]) {
      h.expectError(
        await h.post('/ls', { cookie: author.cookie, body }),
        400,
        'VALIDATION_ERROR',
      );
    }
    // Nothing leaked to the public feed from those rejected writes.
    const feed = await h.get('/feed');
    const titles = feed.body.data.map((l) => l.title);
    assert.ok(!titles.includes('secret'), 'a typo’d-visibility L must never reach the public feed');
  });
});
