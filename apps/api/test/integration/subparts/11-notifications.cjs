'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { notificationSchema, unreadCountSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const listSchema = paginatedSchema(notificationSchema);

describe('11 · notifications (contract §4.11)', () => {
  let author;
  let actor;
  let l;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author', name: 'Ada Lovelace' });
    actor = await h.createUser({ username: 'actor', name: 'Grace Hopper' });
    l = await h.createL(author.id, { title: 'My production outage' });
  });

  const inbox = (user = author) => h.get('/notifications', { cookie: user.cookie });

  test('all notification routes require authentication', async () => {
    h.expectError(await h.get('/notifications'), 401, 'UNAUTHENTICATED');
    h.expectError(await h.get('/notifications/unread-count'), 401, 'UNAUTHENTICATED');
    h.expectError(await h.post('/notifications/read-all'), 401, 'UNAUTHENTICATED');
    h.expectError(await h.post('/notifications/x/read'), 401, 'UNAUTHENTICATED');
  });

  test('an empty inbox is a valid empty page', async () => {
    const res = await inbox();
    const page = h.expectShape(res, listSchema);
    assert.deepEqual(page.data, []);
    assert.equal(page.nextCursor, null);
  });

  test('BEEN_THERE creates a RELATED notification with server-composed copy', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });

    const page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data.length, 1);

    const n = page.data[0];
    assert.equal(n.type, 'RELATED');
    assert.equal(n.message, '1 builder related to your story.');
    assert.equal(n.actor.username, 'actor');
    assert.deepEqual(n.target, { lId: l.id, title: 'My production outage' });
    assert.equal(n.readAt, null);
  });

  test('RELATED notifications fold — many reactors produce one notification with a live count', async () => {
    const others = [];
    for (let i = 0; i < 3; i += 1) {
      const u = await h.createUser({ username: `r${i}` });
      others.push(u);
      await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: u.cookie });
    }

    const page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data.length, 1, 'reactions on one L fold into a single notification');
    assert.equal(page.data[0].message, '3 builders related to your story.');
  });

  test('HELPFUL creates a HELPED notification with outcome-framed copy', async () => {
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: actor.cookie });

    const page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data[0].type, 'HELPED');
    assert.equal(page.data[0].message, 'Your story helped 1 person.');

    const second = await h.createUser({ username: 'second' });
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: second.cookie });

    const updated = await inbox();
    assert.equal(updated.body.data.length, 1);
    assert.equal(updated.body.data[0].message, 'Your story helped 2 people.');
  });

  test('RESPECT, PAIN and SAVED never notify', async () => {
    for (const type of ['RESPECT', 'PAIN', 'SAVED']) {
      await h.put(`/ls/${l.id}/reactions/${type}`, { cookie: actor.cookie });
    }
    assert.deepEqual((await inbox()).body.data, [], 'only RELATED/HELPED reactions notify');
  });

  test('reacting to your own L never notifies you', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: author.cookie });
    await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: author.cookie });
    assert.deepEqual((await inbox()).body.data, []);
  });

  test('the author’s own BEEN_THERE is excluded from the folded count', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: author.cookie });
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });

    const page = await inbox();
    assert.equal(page.body.data[0].message, '1 builder related to your story.');
  });

  test('un-reacting withdraws the folded notification when nobody else reacted', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    assert.equal((await inbox()).body.data.length, 1);

    await h.del(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    assert.deepEqual((await inbox()).body.data, [], 'the notification is retracted');
  });

  test('un-reacting keeps the notification while another builder still reacts', async () => {
    const other = await h.createUser({ username: 'other' });
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: other.cookie });

    await h.del(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });

    const page = await inbox();
    assert.equal(page.body.data.length, 1);
    assert.equal(page.body.data[0].message, '1 builder related to your story.');
  });

  test('each comment creates its own COMMENT notification', async () => {
    await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: 'me too' } });
    await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: 'again' } });

    const page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data.length, 2, 'comments are not folded');
    assert.equal(page.data[0].type, 'COMMENT');
    assert.equal(page.data[0].message, 'Grace Hopper commented on your L.');
  });

  test('commenting on your own L never notifies you', async () => {
    await h.post(`/ls/${l.id}/comments`, { cookie: author.cookie, body: { body: 'self' } });
    assert.deepEqual((await inbox()).body.data, []);
  });

  test('a reply notifies both the L author and the parent commenter, each with its own copy', async () => {
    const parent = await h.post(`/ls/${l.id}/comments`, {
      cookie: actor.cookie,
      body: { body: 'parent' },
    });
    const third = await h.createUser({ username: 'third', name: 'Alan Turing' });
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: third.cookie,
      body: { body: 'reply' },
    });

    const authorInbox = h.expectShape(await inbox(), listSchema);
    assert.equal(authorInbox.data.length, 2, 'the L author hears about the comment and reply');
    assert.equal(authorInbox.data[0].message, 'Alan Turing commented on your L.');

    // The parent commenter does not own this L. Telling them someone "commented on your L"
    // names a story that is not theirs and hides that the reply was to their comment.
    const actorInbox = h.expectShape(await inbox(actor), listSchema);
    assert.equal(actorInbox.data.length, 1, 'the parent commenter hears about the reply');
    assert.equal(actorInbox.data[0].actor.username, 'third');
    assert.equal(actorInbox.data[0].message, 'Alan Turing replied to your comment.');
  });

  test('replying to the L author’s own comment tells them it is their L, exactly once', async () => {
    const parent = await h.post(`/ls/${l.id}/comments`, {
      cookie: author.cookie,
      body: { body: 'my own comment' },
    });
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: actor.cookie,
      body: { body: 'reply' },
    });

    // The author is both the L owner and the parent commenter: one notification, not two, and
    // the L-owner wording wins because the L really is theirs.
    const page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data.length, 1, 'the single recipient is not notified twice');
    assert.equal(page.data[0].message, 'Grace Hopper commented on your L.');
  });

  test('NEW_FOLLOWER uses the actor’s display name, falling back to username', async () => {
    await h.put('/users/author/follow', { cookie: actor.cookie });
    let page = h.expectShape(await inbox(), listSchema);
    assert.equal(page.data[0].type, 'NEW_FOLLOWER');
    assert.equal(page.data[0].message, 'Grace Hopper started following your journey.');
    assert.equal(page.data[0].target, null, 'follow notifications have no L target');

    const nameless = await h.createUser({ username: 'nameless', name: null });
    await h.put('/users/author/follow', { cookie: nameless.cookie });
    page = await inbox();
    assert.equal(page.body.data[0].message, 'nameless started following your journey.');
  });

  test('unread-count tracks unread notifications', async () => {
    const zero = await h.get('/notifications/unread-count', { cookie: author.cookie });
    h.expectShape(zero, unreadCountSchema);
    assert.equal(zero.body.count, 0);

    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: 'x' } });

    const two = await h.get('/notifications/unread-count', { cookie: author.cookie });
    assert.equal(two.body.count, 2);
  });

  test('unread-count caps work at the 9+ indicator boundary', async () => {
    await h.ctx.prisma.notification.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        type: 'NEW_FOLLOWER',
        recipientId: author.id,
        actorId: actor.id,
        dedupeKey: `unread-cap-${index}`,
      })),
    });

    const capped = await h.get('/notifications/unread-count', { cookie: author.cookie });
    h.expectShape(capped, unreadCountSchema);
    assert.equal(capped.body.count, 10, 'the header only needs enough information to render 9+');
  });

  test('POST /notifications/:id/read marks one as read', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    const [n] = (await inbox()).body.data;

    const res = await h.post(`/notifications/${n.id}/read`, { cookie: author.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const after = await inbox();
    assert.notEqual(after.body.data[0].readAt, null);
    assert.equal((await h.get('/notifications/unread-count', { cookie: author.cookie })).body.count, 0);
  });

  test('marking read is idempotent and cannot touch another user’s notification', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    const [n] = (await inbox()).body.data;

    await h.post(`/notifications/${n.id}/read`, { cookie: author.cookie });
    const repeat = await h.post(`/notifications/${n.id}/read`, { cookie: author.cookie });
    assert.equal(repeat.status, 200, 'marking twice must not error');

    const intruder = await h.post(`/notifications/${n.id}/read`, { cookie: actor.cookie });
    assert.equal(intruder.status, 200, 'the API does not leak existence');

    const stillOwned = await h.ctx.prisma.notification.findUnique({ where: { id: n.id } });
    assert.notEqual(stillOwned.readAt, null, 'it stays read for its owner');
  });

  test("marking an unrelated user's unread notification does not mark it read", async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    const [n] = (await inbox()).body.data;

    await h.post(`/notifications/${n.id}/read`, { cookie: actor.cookie });

    const row = await h.ctx.prisma.notification.findUnique({ where: { id: n.id } });
    assert.equal(row.readAt, null, 'a stranger cannot mark your notification read');
  });

  test('POST /notifications/read-all clears the whole inbox', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: 'x' } });

    const res = await h.post('/notifications/read-all', { cookie: author.cookie });
    assert.equal(res.status, 200);
    assert.equal((await h.get('/notifications/unread-count', { cookie: author.cookie })).body.count, 0);

    const page = await inbox();
    assert.ok(page.body.data.every((n) => n.readAt !== null));
  });

  test('a notification for a marking of a missing id is a no-op 200', async () => {
    const res = await h.post('/notifications/01ARZ3NDEKTSV4RRFFQ69G5FAV/read', {
      cookie: author.cookie,
    });
    assert.equal(res.status, 200);
  });

  test('notifications are newest-first and paginate without overlap', async () => {
    for (let i = 0; i < 5; i += 1) {
      await h.post(`/ls/${l.id}/comments`, { cookie: actor.cookie, body: { body: `c${i}` } });
    }

    const first = await h.get('/notifications?limit=2', { cookie: author.cookie });
    const page1 = h.expectShape(first, listSchema);
    assert.equal(page1.data.length, 2);
    assert.ok(page1.nextCursor);

    const second = await h.get(
      `/notifications?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
      { cookie: author.cookie },
    );
    const page2 = h.expectShape(second, listSchema);

    const overlap = page1.data.filter((a) => page2.data.some((b) => b.id === a.id));
    assert.equal(overlap.length, 0);

    const times = [...page1.data, ...page2.data].map((n) => new Date(n.createdAt).getTime());
    const sorted = [...times].sort((a, b) => b - a);
    assert.deepEqual(times, sorted, 'newest first');
  });

  test('a malformed notifications cursor is 400 BAD_CURSOR', async () => {
    const res = await h.get('/notifications?cursor=%2Fnope', { cookie: author.cookie });
    h.expectError(res, 400, 'BAD_CURSOR');
  });

  test('one inbox never leaks into another', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    assert.deepEqual((await inbox(actor)).body.data, []);
    assert.equal((await inbox(author)).body.data.length, 1);
  });

  test('deleting the L removes its notifications', async () => {
    await h.put(`/ls/${l.id}/reactions/BEEN_THERE`, { cookie: actor.cookie });
    assert.equal((await inbox()).body.data.length, 1);

    await h.del(`/ls/${l.id}`, { cookie: author.cookie });
    assert.deepEqual((await inbox()).body.data, [], 'notifications cascade with their L');
  });
});
