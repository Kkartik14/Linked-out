'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { describe, test } = require('node:test');

const {
  PasswordSafetyService,
  PwnedPasswordsClient,
} = require('../../dist/modules/auth/password-safety.service');

function config(mode = 'hibp') {
  return { pwnedPasswords: { mode, timeoutMs: 500 } };
}

function errorCode(error) {
  return error?.getResponse?.().code;
}

describe('password safety', () => {
  test('the local fallback rejects obvious passwords without calling HIBP', async () => {
    let calls = 0;
    const client = new PwnedPasswordsClient(config(), async () => {
      calls += 1;
      throw new Error('should not be called');
    });
    const policy = new PasswordSafetyService(config(), client);

    await assert.rejects(policy.assertAcceptable('password'), (error) => {
      assert.equal(errorCode(error), 'PASSWORD_COMPROMISED');
      return true;
    });
    assert.equal(calls, 0);
  });

  test('HIBP receives only a five-character hash prefix and detects a returned suffix', async () => {
    const password = 'not-common-but-breached';
    const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = digest.slice(0, 5);
    const suffix = digest.slice(5);
    let requestedUrl = '';
    let requestedHeaders;
    const client = new PwnedPasswordsClient(config(), async (url, init) => {
      requestedUrl = String(url);
      requestedHeaders = new globalThis.Headers(init?.headers);
      return new globalThis.Response(`${suffix}:42\r\n${'F'.repeat(35)}:0\r\n`, { status: 200 });
    });

    assert.equal(await client.isCompromised(password), true);
    assert.equal(requestedUrl.endsWith(`/range/${prefix}`), true);
    assert.equal(requestedUrl.includes(suffix), false);
    assert.equal(requestedHeaders.get('add-padding'), 'true');
  });

  test('an unavailable HIBP service fails open for a non-common password', async () => {
    const client = new PwnedPasswordsClient(config(), async () => {
      throw new Error('network unavailable');
    });
    const policy = new PasswordSafetyService(config(), client);

    await assert.doesNotReject(policy.assertAcceptable('an uncommon 8+ char phrase'));
  });

  test('local-only mode never calls the remote provider', async () => {
    let calls = 0;
    const localConfig = config('local-only');
    const client = new PwnedPasswordsClient(localConfig, async () => {
      calls += 1;
      return new globalThis.Response('', { status: 200 });
    });
    const policy = new PasswordSafetyService(localConfig, client);

    await assert.doesNotReject(policy.assertAcceptable('an uncommon 8+ char phrase'));
    assert.equal(calls, 0);
  });
});
