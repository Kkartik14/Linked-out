'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { envSchema } = require('../../dist/config/env');

const productionEnv = {
  NODE_ENV: 'production',
  API_BASE_URL: 'https://api.linkedout.example',
  WEB_URL: 'https://linkedout.example',
  TRUST_PROXY_HOPS: '1',
  DATABASE_URL: 'postgresql://user:pass@db.example/linkedout',
  JWT_ACCESS_SECRET: 'access-secret-long-enough',
  JWT_REFRESH_SECRET: 'refresh-secret-long-enough',
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
