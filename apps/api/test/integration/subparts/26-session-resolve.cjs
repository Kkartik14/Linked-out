'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const {
  BROWSER_SESSION_IDLE_TIMEOUT_MS,
  BrowserSessionAuthority,
  PrismaBrowserSessionPersistence,
} = require('@linkedout/session-authority');
const { ApiAssertionVerifier } = require('@linkedout/internal-auth');
const {
  sessionResolveResponseSchema: resolveContract,
  sessionRevokeResponseSchema: revokeContract,
} = require('@linkedout/contracts');

const h = require('../_harness.cjs');

const VALID_BUT_UNKNOWN_COOKIE = 'A'.repeat(43);

function authority() {
  return new BrowserSessionAuthority(new PrismaBrowserSessionPersistence(h.ctx.prisma));
}

function resolve(cookie, assertion = h.sessionResolveAssertion()) {
  return h.post('/auth/sessions/resolve', {
    headers: { 'x-internal-auth': assertion },
    body: { cookie },
  });
}

function revoke(cookie, assertion = h.sessionRevokeAssertion()) {
  return h.post('/auth/sessions/revoke', {
    headers: { 'x-internal-auth': assertion },
    body: { cookie },
  });
}

describe('26 · BFF session lifecycle', () => {
  beforeEach(h.resetDb);

  test('resolves a live session to an API-issued assertion that authenticates ordinary routes', async () => {
    const user = await h.createUser();
    const session = await authority().create(user.id);

    h.expectError(await h.post('/auth/sessions/resolve', { body: { cookie: session.cookie } }), 401, 'UNAUTHENTICATED');
    h.expectError(await resolve(session.cookie, h.authExchangeAssertion()), 401, 'UNAUTHENTICATED');
    h.expectError(await resolve(session.cookie, h.sessionRevokeAssertion()), 401, 'UNAUTHENTICATED');
    h.expectError(await resolve(session.cookie, h.internalAssertion(user)), 401, 'UNAUTHENTICATED');

    const resolved = await resolve(session.cookie);
    h.expectShape(resolved, resolveContract);
    assert.equal(resolved.body.status, 'authenticated');
    assert.equal(resolved.body.sub, undefined, 'identity is not returned as an unsigned body field');
    assert.equal(resolved.body.sid, undefined, 'session id is carried only by the signed assertion');

    const verification = new ApiAssertionVerifier(h.INTERNAL_API_SECRET).verify(
      resolved.body.assertion,
    );
    assert.equal(verification.kind, 'authenticated');
    assert.equal(verification.claims.sub, user.id);
    assert.equal(verification.claims.sid, session.sid);
    assert.equal(
      resolved.body.expiresAt,
      new Date(verification.claims.exp * 1000).toISOString(),
    );
    assert.equal(resolved.headers.get('cache-control'), 'no-store');

    const authenticated = await h.get('/auth/me', {
      headers: { 'x-internal-auth': resolved.body.assertion },
    });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.body.user.id, user.id);
  });

  test('verified per-request resolution is not charged to the public 30-write IP bucket', async () => {
    const user = await h.createUser();
    const session = await authority().create(user.id);

    for (let request = 1; request <= 35; request += 1) {
      const response = await resolve(session.cookie);
      assert.equal(response.status, 200, `verified internal resolution ${request} must succeed`);
      assert.equal(response.body.status, 'authenticated');
    }
  });

  test('answers 200 with an explicit reason for each presented but non-live cookie', async () => {
    const user = await h.createUser();

    const unknown = await resolve(VALID_BUT_UNKNOWN_COOKIE);
    assert.equal(unknown.status, 200);
    h.expectShape(unknown, resolveContract);
    assert.deepEqual(unknown.body, { status: 'unauthenticated', reason: 'invalid' });

    assert.deepEqual((await resolve('not-a-session-cookie')).body, {
      status: 'unauthenticated',
      reason: 'invalid',
    });

    const revoked = await authority().create(user.id);
    await authority().revoke(revoked.cookie);
    assert.deepEqual((await resolve(revoked.cookie)).body, {
      status: 'unauthenticated',
      reason: 'revoked',
    });

    const idle = await authority().create(user.id);
    const longAgo = new Date(Date.now() - BROWSER_SESSION_IDLE_TIMEOUT_MS - 60_000);
    await h.ctx.prisma.browserSession.update({
      where: { id: idle.sid },
      data: { createdAt: longAgo, lastUsedAt: longAgo },
    });
    assert.deepEqual((await resolve(idle.cookie)).body, {
      status: 'unauthenticated',
      reason: 'expired',
    });
  });

  test('revokes tombstone-first and idempotently behind its own capability', async () => {
    const user = await h.createUser();
    const session = await authority().create(user.id);

    h.expectError(await revoke(session.cookie, h.authExchangeAssertion()), 401, 'UNAUTHENTICATED');
    h.expectError(await revoke(session.cookie, h.sessionResolveAssertion()), 401, 'UNAUTHENTICATED');

    const first = await revoke(session.cookie);
    h.expectShape(first, revokeContract);
    assert.deepEqual(first.body, { ok: true });
    assert.deepEqual((await revoke(session.cookie)).body, { ok: true });
    assert.deepEqual((await resolve(session.cookie)).body, {
      status: 'unauthenticated',
      reason: 'revoked',
    });
  });

  test('rejects empty or over-broad lifecycle bodies at the contract boundary', async () => {
    h.expectError(await resolve(''), 400, 'VALIDATION_ERROR');
    h.expectError(await revoke(''), 400, 'VALIDATION_ERROR');

    const overBroad = await h.post('/auth/sessions/resolve', {
      headers: { 'x-internal-auth': h.sessionResolveAssertion() },
      body: { cookie: VALID_BUT_UNKNOWN_COOKIE, sub: '01ARZ3NDEKTSV4RRFFQ69G5FAV' },
    });
    h.expectError(overBroad, 400, 'VALIDATION_ERROR');
  });

  test('rate-limits repeated rejected BFF assertions before private ingress is available', async () => {
    let limited;
    for (let attempt = 1; attempt <= 40; attempt += 1) {
      const response = await resolve(VALID_BUT_UNKNOWN_COOKIE, 'forged');
      if (response.status === 429) {
        limited = response;
        break;
      }
      h.expectError(response, 401, 'UNAUTHENTICATED');
    }

    assert.ok(limited, 'rejected assertions must reach a bounded IP abuse budget');
    h.expectError(limited, 429, 'RATE_LIMITED');
    assert.match(limited.headers.get('retry-after'), /^\d+$/);
  });
});
