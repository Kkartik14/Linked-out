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

const validProductionEnv = {
  ...productionEnv,
  R2_PUBLIC_BASE_URL: 'https://cdn.linkedout.example',
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

test('legacy production does not require the inactive public OAuth callback origin', () => {
  const result = envSchema.safeParse({
    ...validProductionEnv,
    OAUTH_SESSION_MODE: 'legacy',
    PUBLIC_OAUTH_CALLBACK_BASE_URL: '',
  });

  assert.equal(result.success, true);
});

test('handoff callback uses the normalized public web origin', () => {
  const accepted = envSchema.safeParse({
    ...validProductionEnv,
    NODE_ENV: 'test',
    OAUTH_SESSION_MODE: 'handoff',
    WEB_URL: 'https://linkedout.example',
    PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://LINKEDOUT.example:443',
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.data.WEB_URL, 'https://linkedout.example');
  assert.equal(accepted.data.PUBLIC_OAUTH_CALLBACK_BASE_URL, 'https://linkedout.example');

  const rejected = envSchema.safeParse({
    ...validProductionEnv,
    NODE_ENV: 'test',
    OAUTH_SESSION_MODE: 'handoff',
    PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://oauth.linkedout.example',
  });
  assert.equal(rejected.success, false);
  assert.ok(
    rejected.error.issues.some(
      (issue) =>
        issue.path.join('.') === 'PUBLIC_OAUTH_CALLBACK_BASE_URL' &&
        issue.message.includes('WEB_URL'),
    ),
  );
});

test('accepted application origins are emitted canonically for URL concatenation and CORS', () => {
  const result = envSchema.safeParse({
    ...validProductionEnv,
    NODE_ENV: 'test',
    API_BASE_URL: 'https://API.linkedout.example:443/',
    WEB_URL: 'https://WEB.linkedout.example:443/',
    PUBLIC_OAUTH_CALLBACK_BASE_URL: '',
  });

  assert.equal(result.success, true);
  assert.equal(result.data.API_BASE_URL, 'https://api.linkedout.example');
  assert.equal(result.data.WEB_URL, 'https://web.linkedout.example');
  assert.equal(result.data.PUBLIC_OAUTH_CALLBACK_BASE_URL, '');
});

test('application origins reject credentials, paths, queries, fragments, and non-HTTP schemes', () => {
  const invalidOrigins = [
    'https://user:secret@linkedout.example',
    'https://linkedout.example/path',
    'https://linkedout.example?query=1',
    'https://linkedout.example#fragment',
    'ftp://linkedout.example',
  ];

  for (const field of ['API_BASE_URL', 'WEB_URL', 'PUBLIC_OAUTH_CALLBACK_BASE_URL']) {
    for (const origin of invalidOrigins) {
      const result = envSchema.safeParse({
        ...validProductionEnv,
        NODE_ENV: 'test',
        OAUTH_SESSION_MODE: field === 'PUBLIC_OAUTH_CALLBACK_BASE_URL' ? 'handoff' : 'legacy',
        [field]: origin,
      });
      assert.equal(result.success, false, `${field} must reject ${origin}`);
      assert.ok(
        result.error.issues.some((issue) => issue.path.join('.') === field),
        `${field} must own the validation issue for ${origin}`,
      );
    }
  }
});

test('handoff production permits a private HTTPS API origin while legacy production does not', () => {
  const handoff = envSchema.safeParse({
    ...validProductionEnv,
    OAUTH_SESSION_MODE: 'handoff',
    API_BASE_URL: 'https://10.0.0.5',
  });
  assert.equal(handoff.success, true);

  const legacy = envSchema.safeParse({
    ...validProductionEnv,
    OAUTH_SESSION_MODE: 'legacy',
    API_BASE_URL: 'https://10.0.0.5',
  });
  assert.equal(legacy.success, false);
  assert.ok(legacy.error.issues.some((issue) => issue.path.join('.') === 'API_BASE_URL'));
});

test('production rejects insecure or non-public browser and storage endpoints without throwing', () => {
  const cases = [
    ['API_BASE_URL', 'http://10.0.0.5', { OAUTH_SESSION_MODE: 'handoff' }],
    [
      'WEB_URL',
      'https://10.0.0.6',
      { OAUTH_SESSION_MODE: 'handoff', PUBLIC_OAUTH_CALLBACK_BASE_URL: 'https://10.0.0.6' },
    ],
    [
      'PUBLIC_OAUTH_CALLBACK_BASE_URL',
      'https://10.0.0.7',
      { OAUTH_SESSION_MODE: 'handoff', WEB_URL: 'https://10.0.0.7' },
    ],
    ['R2_PUBLIC_BASE_URL', 'https://192.168.1.2', {}],
    ['R2_ENDPOINT', 'https://127.0.0.1', {}],
  ];

  for (const [field, value, overrides] of cases) {
    let result;
    assert.doesNotThrow(() => {
      result = envSchema.safeParse({ ...validProductionEnv, ...overrides, [field]: value });
    }, field);
    assert.equal(result.success, false, `${field} must reject ${value}`);
    assert.ok(result.error.issues.some((issue) => issue.path.join('.') === field), field);
  }

  assert.doesNotThrow(() => envSchema.safeParse({ ...validProductionEnv, API_BASE_URL: 'not a url' }));
});
