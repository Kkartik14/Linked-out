'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const {
  oauthHandoffExchangeResponseSchema,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');
const {
  OAuthHandoffRepository,
} = require('../../../dist/modules/auth/oauth-handoff.repository');
const {
  hashOAuthHandoffCode,
  OAuthHandoffService,
} = require('../../../dist/modules/auth/oauth-handoff.service');

function authority() {
  const repository = new OAuthHandoffRepository({ db: h.ctx.prisma });
  return new OAuthHandoffService(repository);
}

function exchange(code, assertion = h.authExchangeAssertion()) {
  return h.post('/auth/oauth/handoff/exchange', {
    headers: { 'x-internal-auth': assertion },
    body: { code },
  });
}

describe('24 · purpose-scoped OAuth handoffs', () => {
  beforeEach(h.resetDb);

  test('the exchange is private, one-time, and returns only server-bound values', async () => {
    const user = await h.createUser();
    const code = await authority().issue(user.id, '/journey?view=recent');
    const stored = await h.ctx.prisma.oAuthHandoff.findUnique({
      where: { codeHash: hashOAuthHandoffCode(code) },
    });
    assert.ok(stored);
    assert.equal(stored.codeHash === code, false);
    assert.equal(stored.sub, user.id);
    assert.equal(stored.returnTo, '/journey?view=recent');
    assert.equal(stored.consumedAt, null);

    const missingAssertion = await h.post('/auth/oauth/handoff/exchange', {
      body: { code },
    });
    h.expectError(missingAssertion, 401, 'UNAUTHENTICATED');

    const wrongPurpose = await exchange(code, h.internalAssertion(user));
    h.expectError(wrongPurpose, 401, 'UNAUTHENTICATED');

    const success = await exchange(code);
    h.expectShape(success, oauthHandoffExchangeResponseSchema);
    assert.deepEqual(success.body, { sub: user.id, returnTo: '/journey?view=recent' });
    assert.equal(success.headers.get('cache-control'), 'no-store');

    const replay = await exchange(code);
    h.expectError(replay, 400, 'INVALID_HANDOFF');
  });

  test('one concurrent exchange wins and every replay has the same generic outcome', async () => {
    const user = await h.createUser();
    const code = await authority().issue(user.id, '/feed');
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => exchange(code)),
    );

    assert.equal(attempts.filter(({ status }) => status === 200).length, 1);
    assert.equal(attempts.filter(({ status }) => status === 400).length, 7);
    for (const rejected of attempts.filter(({ status }) => status === 400)) {
      assert.equal(rejected.body.error.code, 'INVALID_HANDOFF');
    }
  });

  test('expired, unknown, and malformed codes reveal no persisted state', async () => {
    const user = await h.createUser();
    const code = await authority().issue(user.id, '/');
    const createdAt = new Date(Date.now() - 120_000);
    await h.ctx.prisma.oAuthHandoff.update({
      where: { codeHash: hashOAuthHandoffCode(code) },
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 60_000),
      },
    });

    h.expectError(await exchange(code), 400, 'INVALID_HANDOFF');
    h.expectError(await exchange('B'.repeat(43)), 400, 'INVALID_HANDOFF');

    const malformed = await exchange('short');
    h.expectError(malformed, 400, 'VALIDATION_ERROR');
    const overBroad = await h.post('/auth/oauth/handoff/exchange', {
      headers: { 'x-internal-auth': h.authExchangeAssertion() },
      body: { code: 'B'.repeat(43), returnTo: '/attacker-controlled' },
    });
    h.expectError(overBroad, 400, 'VALIDATION_ERROR');
  });
});
