'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { avatarUploadResponseSchema, AVATAR_MAX_BYTES } = require('@linkedout/contracts');

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
});
