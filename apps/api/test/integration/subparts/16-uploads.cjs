'use strict';

const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { describe, test, beforeEach } = require('node:test');
const { avatarUploadResponseSchema, AVATAR_MAX_BYTES } = require('@linkedout/contracts');
const { PrismaCleanupPersistence } = require('../../../dist/maintenance/prisma-cleanup.persistence');

const h = require('../_harness.cjs');

const VALID = { contentType: 'image/jpeg', contentLength: 204_800 };

describe('16 · avatar uploads (contract §4.9)', () => {
  let user;

  beforeEach(async () => {
    await h.resetDb();
    user = await h.createUser({ username: 'uploader' });
  });

  test('POST /uploads/avatar returns a presigned URL bundle (200, not 201)', async () => {
    const res = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    const upload = h.expectShape(res, avatarUploadResponseSchema, 200);

    assert.ok(upload.uploadUrl.startsWith('https://'), 'uploadUrl must be an https presigned URL');
    assert.ok(upload.uploadUrl.includes('X-Amz-Signature'), 'must actually be presigned');
    assert.equal(upload.expiresIn, 300, 'the contract promises a 5-minute expiry');
    assert.deepEqual(upload.headers, { 'Content-Type': 'image/jpeg' });
  });

  test('publicUrl is namespaced under the caller’s own avatars/<userId>/ prefix', async () => {
    const res = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    const { publicUrl } = res.body;

    assert.ok(
      publicUrl.startsWith(`${h.R2_PUBLIC_BASE_URL}/avatars/${user.id}/`),
      `publicUrl ${publicUrl} must live under this user's prefix`,
    );
    assert.ok(publicUrl.endsWith('.jpg'));
  });

  test('the returned publicUrl is exactly what PATCH /users/me accepts', async () => {
    const presign = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    const res = await h.patch('/users/me', {
      cookie: user.cookie,
      body: { image: presign.body.publicUrl },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.image, presign.body.publicUrl);
    const persisted = await h.ctx.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { avatarObjectKey: true },
    });
    assert.equal(
      persisted.avatarObjectKey,
      new URL(presign.body.publicUrl).pathname.slice(1),
      'profile writes persist stable object identity separately from the public URL',
    );
  });

  test('profile publication waits for the cleanup key lock and rejects the committed claim', async () => {
    const presign = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    const objectKey = new URL(presign.body.publicUrl).pathname.slice(1);
    let lockReady;
    let releaseLock;
    const ready = new Promise((resolve) => { lockReady = resolve; });
    const release = new Promise((resolve) => { releaseLock = resolve; });
    const claim = h.ctx.prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(
        'SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended($1, 0))',
        objectKey,
      );
      lockReady();
      await release;
      await tx.avatarDeletionClaim.create({ data: { key: objectKey, attempts: 1 } });
    });
    await ready;

    let profileWriteSettled = false;
    const profileWrite = h.patch('/users/me', {
      cookie: user.cookie,
      body: { image: presign.body.publicUrl },
    }).finally(() => {
      profileWriteSettled = true;
    });
    await delay(75);
    assert.equal(profileWriteSettled, false, 'profile write must wait on the cleanup key lock');
    releaseLock();
    await claim;

    const res = await profileWrite;
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.match(error.message, /no longer available/i);
  });

  test('cleanup recognizes a persisted avatar key after the public CDN base changes', async () => {
    const objectKey = `avatars/${user.id}/01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg`;
    await h.ctx.prisma.user.update({
      where: { id: user.id },
      data: {
        image: `https://old-cdn.example.test/${objectKey}`,
        avatarObjectKey: objectKey,
      },
    });

    const persistence = new PrismaCleanupPersistence(h.ctx.prisma);
    const references = await persistence.findReferencedAvatarKeys([objectKey]);
    assert.deepEqual([...references], [objectKey]);
  });

  test('cleanup persistence durably claims an unreferenced key for retryable deletion', async () => {
    const objectKey = `avatars/${user.id}/01BRZ3NDEKTSV4RRFFQ69G5FAV.jpg`;
    const persistence = new PrismaCleanupPersistence(h.ctx.prisma);

    const selection = await persistence.claimUnreferencedAvatarKeys([objectKey]);

    assert.deepEqual([...selection.referenced], []);
    assert.deepEqual([...selection.claimed], [objectKey]);
    const claim = await h.ctx.prisma.avatarDeletionClaim.findUniqueOrThrow({
      where: { key: objectKey },
    });
    assert.equal(claim.attempts, 1);
    assert.equal(claim.deletedAt, null);
  });

  test('apply preflight finds path-prefixed legacy drift but ignores a cross-user URL', async () => {
    const ownKey = `avatars/${user.id}/01ARZ3NDEKTSV4RRFFQ69G5FAV.jpg`;
    await h.ctx.prisma.user.update({
      where: { id: user.id },
      data: { image: `https://old-cdn.example.test/media/public/${ownKey}` },
    });
    const other = await h.createUser({ username: 'cross_user_avatar' });
    await h.ctx.prisma.user.update({
      where: { id: other.id },
      data: { image: `https://old-cdn.example.test/media/public/${ownKey}` },
    });

    const persistence = new PrismaCleanupPersistence(h.ctx.prisma);
    const audit = await persistence.auditAvatarIdentity(100);
    assert.deepEqual(audit, {
      drifted: 1,
      samples: [ownKey],
      samplesTruncated: false,
    });
  });

  test('each content type maps to its own extension', async () => {
    const extensions = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
    for (const [contentType, extension] of Object.entries(extensions)) {
      const res = await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType, contentLength: 1024 },
      });
      const upload = h.expectShape(res, avatarUploadResponseSchema);
      assert.ok(upload.publicUrl.endsWith(extension), `${contentType} → ${extension}`);
      assert.equal(upload.headers['Content-Type'], contentType);
    }
  });

  test('two presigns never collide on the same key', async () => {
    const a = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    const b = await h.post('/uploads/avatar', { cookie: user.cookie, body: VALID });
    assert.notEqual(a.body.publicUrl, b.body.publicUrl);
  });

  test('rejects a disallowed content type', async () => {
    for (const contentType of ['image/gif', 'image/svg+xml', 'application/pdf', 'text/html']) {
      const res = await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType, contentLength: 1024 },
      });
      const error = h.expectError(res, 400, 'VALIDATION_ERROR');
      assert.equal(error.details[0].field, 'contentType');
      assert.equal(error.details[0].code, 'invalid_enum');
    }
  });

  test('enforces the 5 MB cap and a positive size', async () => {
    assert.equal(AVATAR_MAX_BYTES, 5_242_880);

    h.expectShape(
      await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType: 'image/png', contentLength: AVATAR_MAX_BYTES },
      }),
      avatarUploadResponseSchema,
    );

    const tooBig = await h.post('/uploads/avatar', {
      cookie: user.cookie,
      body: { contentType: 'image/png', contentLength: AVATAR_MAX_BYTES + 1 },
    });
    const error = h.expectError(tooBig, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].field, 'contentLength');

    h.expectError(
      await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType: 'image/png', contentLength: 0 },
      }),
      400,
      'VALIDATION_ERROR',
    );
    h.expectError(
      await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType: 'image/png', contentLength: -1 },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });

  test('a missing body reports both required fields', async () => {
    const res = await h.post('/uploads/avatar', { cookie: user.cookie, body: {} });
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.deepEqual(error.details.map((d) => d.field).sort(), ['contentLength', 'contentType']);
  });

  test('requires authentication', async () => {
    h.expectError(await h.post('/uploads/avatar', { body: VALID }), 401, 'UNAUTHENTICATED');
  });

  test('a server without R2 configured returns 503 UPLOADS_DISABLED', async () => {
    const res = await h.post('/uploads/avatar', {
      baseUrl: h.ctx.noUploadsBaseUrl,
      cookie: user.cookie,
      body: VALID,
    });
    h.expectError(res, 503, 'UPLOADS_DISABLED');
  });

  test('with uploads disabled, no avatar image can be set at all', async () => {
    const res = await h.patch('/users/me', {
      baseUrl: h.ctx.noUploadsBaseUrl,
      cookie: user.cookie,
      body: { image: 'https://cdn.example.com/avatars/x.jpg' },
    });
    h.expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('an unknown field on the avatar-upload request is rejected (CONTRACT-01)', async () => {
    const user = await h.createUser();
    h.expectError(
      await h.post('/uploads/avatar', {
        cookie: user.cookie,
        body: { contentType: 'image/png', contentLength: 1024, public: true },
      }),
      400,
      'VALIDATION_ERROR',
    );
  });
});
