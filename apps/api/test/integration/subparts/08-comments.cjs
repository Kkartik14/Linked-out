'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { commentSchema, paginatedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const listSchema = paginatedSchema(commentSchema);

describe('08 · comments (contract §4.6)', () => {
  let author;
  let commenter;
  let l;

  beforeEach(async () => {
    await h.resetDb();
    author = await h.createUser({ username: 'author' });
    commenter = await h.createUser({ username: 'commenter' });
    l = await h.createL(author.id);
  });

  const addComment = (cookie, body = 'I experienced this exact thing.') =>
    h.post(`/ls/${l.id}/comments`, { cookie, body: { body } });

  test('POST creates a top-level comment matching the contract shape', async () => {
    const res = await addComment(commenter.cookie);
    const comment = h.expectShape(res, commentSchema, 201);

    assert.equal(comment.body, 'I experienced this exact thing.');
    assert.equal(comment.lId, l.id);
    assert.equal(comment.parentId, null);
    assert.equal(comment.replyCount, 0);
    assert.equal(comment.author.username, 'commenter');
    assert.equal(comment.viewer.canDelete, true);
  });

  test('POST /comments/:id/replies creates a one-level-deep reply', async () => {
    const parent = await addComment(commenter.cookie);
    const res = await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'Thanks for sharing.' },
    });
    const reply = h.expectShape(res, commentSchema, 201);

    assert.equal(reply.parentId, parent.body.id);
    assert.equal(reply.lId, l.id, 'a reply inherits its parent’s L');
  });

  test('replying to a reply is rejected — threading is exactly one level', async () => {
    const parent = await addComment(commenter.cookie);
    const reply = await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'first reply' },
    });

    const res = await h.post(`/comments/${reply.body.id}/replies`, {
      cookie: commenter.cookie,
      body: { body: 'nested too deep' },
    });
    h.expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('replyCount reflects the number of replies', async () => {
    const parent = await addComment(commenter.cookie);
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'a' },
    });
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: commenter.cookie,
      body: { body: 'b' },
    });

    const list = await h.get(`/ls/${l.id}/comments`);
    assert.equal(list.body.data[0].replyCount, 2);
  });

  test('GET /ls/:id/comments lists top-level comments only, oldest first', async () => {
    const first = await addComment(commenter.cookie, 'first');
    const second = await addComment(commenter.cookie, 'second');
    await h.post(`/comments/${first.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'a reply' },
    });

    const res = await h.get(`/ls/${l.id}/comments`);
    const page = h.expectShape(res, listSchema);

    assert.deepEqual(page.data.map((c) => c.id), [first.body.id, second.body.id]);
    assert.ok(page.data.every((c) => c.parentId === null), 'replies are not inlined');
  });

  test('GET /comments/:id/replies lists the thread, oldest first', async () => {
    const parent = await addComment(commenter.cookie);
    const r1 = await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'r1' },
    });
    const r2 = await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: commenter.cookie,
      body: { body: 'r2' },
    });

    const res = await h.get(`/comments/${parent.body.id}/replies`);
    const page = h.expectShape(res, listSchema);
    assert.deepEqual(page.data.map((c) => c.id), [r1.body.id, r2.body.id]);
  });

  test('commentCount on the L counts top-level comments AND replies', async () => {
    const parent = await addComment(commenter.cookie);
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'r' },
    });

    const detail = await h.get(`/ls/${l.id}`);
    assert.equal(detail.body.commentCount, 2);
  });

  test('deleting a comment removes its replies and recomputes commentCount', async () => {
    const parent = await addComment(commenter.cookie);
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'r1' },
    });
    await h.post(`/comments/${parent.body.id}/replies`, {
      cookie: author.cookie,
      body: { body: 'r2' },
    });
    const survivor = await addComment(commenter.cookie, 'survivor');

    assert.equal((await h.get(`/ls/${l.id}`)).body.commentCount, 4);

    const res = await h.del(`/comments/${parent.body.id}`, { cookie: commenter.cookie });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const detail = await h.get(`/ls/${l.id}`);
    assert.equal(detail.body.commentCount, 1, 'the parent and both replies are gone');

    const list = await h.get(`/ls/${l.id}/comments`);
    assert.deepEqual(list.body.data.map((c) => c.id), [survivor.body.id]);
  });

  test('viewer.canDelete is true only for the comment author', async () => {
    const comment = await addComment(commenter.cookie);

    const asCommenter = await h.get(`/ls/${l.id}/comments`, { cookie: commenter.cookie });
    assert.equal(asCommenter.body.data[0].viewer.canDelete, true);

    const asLAuthor = await h.get(`/ls/${l.id}/comments`, { cookie: author.cookie });
    assert.equal(
      asLAuthor.body.data[0].viewer.canDelete,
      false,
      'the L author cannot delete other people’s comments',
    );

    const asAnon = await h.get(`/ls/${l.id}/comments`);
    assert.equal(asAnon.body.data[0].viewer.canDelete, false);

    void comment;
  });

  test('a non-author cannot delete a comment', async () => {
    const comment = await addComment(commenter.cookie);
    h.expectError(await h.del(`/comments/${comment.body.id}`, { cookie: author.cookie }), 403, 'FORBIDDEN');
  });

  test('deleting a missing comment is 404 COMMENT_NOT_FOUND', async () => {
    h.expectError(
      await h.del('/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV', { cookie: commenter.cookie }),
      404,
      'COMMENT_NOT_FOUND',
    );
  });

  test('replying to a missing comment is 404 COMMENT_NOT_FOUND', async () => {
    const res = await h.post('/comments/01ARZ3NDEKTSV4RRFFQ69G5FAV/replies', {
      cookie: commenter.cookie,
      body: { body: 'hello' },
    });
    h.expectError(res, 404, 'COMMENT_NOT_FOUND');
  });

  test('enforces the 1..2000 character body limit', async () => {
    h.expectError(await addComment(commenter.cookie, ''), 400, 'VALIDATION_ERROR');
    h.expectError(await addComment(commenter.cookie, 'x'.repeat(2001)), 400, 'VALIDATION_ERROR');
    h.expectShape(await addComment(commenter.cookie, 'x'.repeat(2000)), commentSchema, 201);
  });

  test('a missing body field reports `required`', async () => {
    const res = await h.post(`/ls/${l.id}/comments`, { cookie: commenter.cookie, body: {} });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].field, 'body');
    assert.equal(error.details[0].code, 'required');
  });

  test('commenting requires authentication and a finished onboarding', async () => {
    h.expectError(await h.post(`/ls/${l.id}/comments`, { body: { body: 'x' } }), 401, 'UNAUTHENTICATED');

    const fresh = await h.createOnboardingUser();
    h.expectError(await addComment(fresh.cookie), 403, 'FORBIDDEN');
  });

  test('comments on an invisible L are neither readable nor writable', async () => {
    const hidden = await h.createL(author.id, { visibility: 'PRIVATE' });

    h.expectError(await h.get(`/ls/${hidden.id}/comments`, { cookie: commenter.cookie }), 404, 'L_NOT_FOUND');
    h.expectError(
      await h.post(`/ls/${hidden.id}/comments`, { cookie: commenter.cookie, body: { body: 'x' } }),
      404,
      'L_NOT_FOUND',
    );
  });

  test('comments on a missing L are 404 L_NOT_FOUND', async () => {
    h.expectError(await h.get('/ls/01ARZ3NDEKTSV4RRFFQ69G5FAV/comments'), 404, 'L_NOT_FOUND');
  });

  test('an anonymous L still attributes its comments to real authors', async () => {
    const anon = await h.createL(author.id, { isAnonymous: true });
    await h.post(`/ls/${anon.id}/comments`, { cookie: commenter.cookie, body: { body: 'hi' } });

    const detail = await h.get(`/ls/${anon.id}`);
    assert.equal(detail.body.author, null, 'the L author is hidden');

    const comments = await h.get(`/ls/${anon.id}/comments`);
    assert.equal(comments.body.data[0].author.username, 'commenter', 'commenters are not anonymous');
  });

  test('comments paginate with an opaque cursor', async () => {
    for (let i = 0; i < 5; i += 1) await addComment(commenter.cookie, `c${i}`);

    const first = await h.get(`/ls/${l.id}/comments?limit=2`);
    const page1 = h.expectShape(first, listSchema);
    assert.equal(page1.data.length, 2);
    assert.ok(page1.nextCursor);

    const second = await h.get(
      `/ls/${l.id}/comments?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`,
    );
    const page2 = h.expectShape(second, listSchema);
    assert.equal(page2.data.length, 2);

    const overlap = page1.data.filter((a) => page2.data.some((b) => b.id === a.id));
    assert.equal(overlap.length, 0, 'pages must not overlap');
  });
});
