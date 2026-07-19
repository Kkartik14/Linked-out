'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { envSchema } = require('../../dist/config/env');

const productionEnv = {
  NODE_ENV: 'production',
  API_BASE_URL: 'https://api.linkedout.example',
  WEB_URL: 'https://linkedout.example',
  PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://linkedout.example',
  TRUST_PROXY_HOPS: '1',
  DATABASE_URL: 'postgresql://user:pass@db.example/linkedout',
  JWT_ACCESS_SECRET: 'access-secret-long-enough',
  JWT_REFRESH_SECRET: 'refresh-secret-long-enough',
  INTERNAL_API_SECRET: 'internal-api-secret-at-least-32-bytes',
  BFF_CALLER_SECRET: 'bff-caller-secret-at-least-32-bytes',
  COOKIE_DOMAIN: '.linkedout.example',
  GOOGLE_CLIENT_ID: 'google-client',
  GOOGLE_CLIENT_SECRET: 'google-secret',
  GITHUB_CLIENT_ID: 'github-client',
  GITHUB_CLIENT_SECRET: 'github-secret',
  R2_ACCESS_KEY_ID: 'r2-access',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_BUCKET: 'avatars',
  R2_ENDPOINT: 'https://r2.example.com',
};

test('missing production R2 URL returns the intended validation issue, never a TypeError', () => {
  let result;
  assert.doesNotThrow(() => {
    result = envSchema.safeParse(productionEnv);
  });
  assert.equal(result.success, false);
  assert.ok(
    result.error.issues.some(
      (issue) =>
        issue.path.join('.') === 'R2_PUBLIC_BASE_URL' &&
        issue.message === 'R2_PUBLIC_BASE_URL is required in production.',
    ),
  );
});

test('the internal assertion keys are pairwise distinct from browser-token secrets and each other', () => {
  for (const field of ['INTERNAL_API_SECRET', 'BFF_CALLER_SECRET']) {
    for (const reused of [productionEnv.JWT_ACCESS_SECRET, productionEnv.JWT_REFRESH_SECRET]) {
      const result = envSchema.safeParse({
        ...productionEnv,
        [field]: reused,
      });
      assert.equal(result.success, false);
      assert.ok(
        result.error.issues.some(
          (issue) =>
            issue.path.join('.') === field &&
            issue.message.includes('distinct from legacy JWT secrets'),
        ),
      );
    }
  }

  const sharedInternalKey = envSchema.safeParse({
    ...productionEnv,
    BFF_CALLER_SECRET: productionEnv.INTERNAL_API_SECRET,
  });
  assert.equal(sharedInternalKey.success, false);
  assert.ok(
    sharedInternalKey.error.issues.some(
      (issue) =>
        issue.path.join('.') === 'BFF_CALLER_SECRET' &&
        issue.message.includes('distinct from INTERNAL_API_SECRET'),
    ),
  );
});

test('handoff OAuth mode requires both the caller and API assertion keys', () => {
  for (const field of ['INTERNAL_API_SECRET', 'BFF_CALLER_SECRET']) {
    const result = envSchema.safeParse({
      ...productionEnv,
      NODE_ENV: 'test',
      OAUTH_SESSION_MODE: 'handoff',
      [field]: '',
    });
    assert.equal(result.success, false);
    assert.ok(
      result.error.issues.some(
        (issue) =>
          issue.path.join('.') === field &&
          issue.message.includes('OAUTH_SESSION_MODE is handoff'),
      ),
    );
  }
});

test('handoff OAuth mode requires a public callback origin distinct from the private API', () => {
  for (const callbackOrigin of ['', productionEnv.API_BASE_URL]) {
    const result = envSchema.safeParse({
      ...productionEnv,
      NODE_ENV: 'test',
      OAUTH_SESSION_MODE: 'handoff',
      PUBLIC_OAUTH_CALLBACK_BASE_URL: callbackOrigin,
    });
    assert.equal(result.success, false);
    assert.ok(
      result.error.issues.some(
        (issue) => issue.path.join('.') === 'PUBLIC_OAUTH_CALLBACK_BASE_URL',
      ),
    );
  }
});
