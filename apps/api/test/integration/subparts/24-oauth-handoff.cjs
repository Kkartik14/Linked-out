'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const {
  oauthHandoffExchangeResponseSchema,
} = require('@linkedout/contracts');
const {
  BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
  BrowserSessionAuthority,
  PrismaBrowserSessionPersistence,
  hashBrowserSessionCookie,
  hashOAuthHandoffCode,
} = require('@linkedout/session-authority');

const h = require('../_harness.cjs');
const {
  OAuthHandoffRepository,
} = require('../../../dist/modules/auth/oauth-handoff.repository');
const {
  OAuthHandoffService,
} = require('../../../dist/modules/auth/oauth-handoff.service');
const {
  PrismaCleanupPersistence,
} = require('../../../dist/maintenance/prisma-cleanup.persistence');

function authority() {
  const repository = new OAuthHandoffRepository({ db: h.ctx.prisma });
  return new OAuthHandoffService(repository);
}

function sessionAuthority(options) {
  return new BrowserSessionAuthority(
    new PrismaBrowserSessionPersistence(h.ctx.prisma),
    options,
  );
}

function exchange(code, assertion = h.authExchangeAssertion()) {
  return h.post('/auth/oauth/handoff/exchange', {
    headers: { 'x-internal-auth': assertion },
    body: { code },
  });
}

describe('24 · purpose-scoped OAuth handoffs', () => {
  beforeEach(h.resetDb);

  test('the exchange is private, one-time, and creates the authoritative browser session', async () => {
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
    h.expectError(await exchange(code, h.sessionResolveAssertion()), 401, 'UNAUTHENTICATED');
    h.expectError(await exchange(code, h.sessionRevokeAssertion()), 401, 'UNAUTHENTICATED');

    const success = await exchange(code);
    h.expectShape(success, oauthHandoffExchangeResponseSchema);
    assert.equal(success.body.sub, undefined, 'the BFF cannot choose a subject for the session');
    assert.equal(success.body.returnTo, '/journey?view=recent');
    assert.match(success.body.cookie, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(typeof success.body.expiresAt, 'string');
    assert.equal(success.headers.get('cache-control'), 'private, no-store, max-age=0');

    const session = await h.ctx.prisma.browserSession.findUnique({
      where: { cookieHash: hashBrowserSessionCookie(success.body.cookie) },
    });
    assert.ok(session);
    assert.equal(session.sub, user.id);
    assert.notEqual(session.cookieHash, success.body.cookie);
    assert.equal(
      new Date(success.body.expiresAt).getTime(),
      session.createdAt.getTime() + BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
      'the browser cookie survives sliding idle sessions until the absolute cap',
    );

    const replay = await exchange(code);
    h.expectError(replay, 400, 'INVALID_HANDOFF');
  });

  test('session creation failure rolls back handoff consumption so the code remains retryable', async () => {
    const user = await h.createUser();
    const collidingCookie = 'C'.repeat(43);
    const collidingAuthority = sessionAuthority({
      tokenSource: { generate: () => collidingCookie },
    });
    await collidingAuthority.create(user.id);
    const code = await authority().issue(user.id, '/retry-after-outage');

    await assert.rejects(() => collidingAuthority.exchangeOAuthHandoff(code));

    const rolledBack = await h.ctx.prisma.oAuthHandoff.findUniqueOrThrow({
      where: { codeHash: hashOAuthHandoffCode(code) },
    });
    assert.equal(rolledBack.consumedAt, null);
    assert.equal(await h.ctx.prisma.browserSession.count(), 1, 'no orphan session was inserted');

    const recovered = await sessionAuthority().exchangeOAuthHandoff(code);
    assert.ok(recovered);
    assert.equal(recovered.returnTo, '/retry-after-outage');
    assert.equal(await h.ctx.prisma.browserSession.count(), 2);
  });

  test('one concurrent exchange wins and every replay has the same generic outcome', async () => {
    const user = await h.createUser();
    const code = await authority().issue(user.id, '/feed');
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () => exchange(code)),
    );

    assert.equal(attempts.filter(({ status }) => status === 200).length, 1);
    assert.equal(attempts.filter(({ status }) => status === 400).length, 7);
    assert.equal(await h.ctx.prisma.browserSession.count(), 1);
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

  test('bounded cleanup removes expired handoffs but retains live replay tombstones', async () => {
    const user = await h.createUser();
    const handoffs = authority();
    const expiredCodes = await Promise.all([
      handoffs.issue(user.id, '/one'),
      handoffs.issue(user.id, '/two'),
    ]);
    const liveCode = await handoffs.issue(user.id, '/live');
    const consumed = await exchange(liveCode);
    assert.equal(consumed.status, 200);

    const createdAt = new Date(Date.now() - 120_000);
    await h.ctx.prisma.oAuthHandoff.updateMany({
      where: { codeHash: { in: expiredCodes.map(hashOAuthHandoffCode) } },
      data: {
        createdAt,
        expiresAt: new Date(createdAt.getTime() + 60_000),
      },
    });

    const cleanup = new PrismaCleanupPersistence(h.ctx.prisma);
    assert.equal(await cleanup.deleteExpiredBatch('oauthHandoffs', new Date(), 1), 1);
    assert.equal(await cleanup.deleteExpiredBatch('oauthHandoffs', new Date(), 1), 1);
    assert.equal(await cleanup.deleteExpiredBatch('oauthHandoffs', new Date(), 1), 0);
    assert.equal(await h.ctx.prisma.oAuthHandoff.count(), 1);
    assert.ok(
      await h.ctx.prisma.oAuthHandoff.findUnique({
        where: { codeHash: hashOAuthHandoffCode(liveCode) },
      }),
    );
  });
});
