'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');
const { authMeResponseSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');

/** Parses `Set-Cookie` into a map of name → { value, attrs }. */
function setCookies(headers) {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
  const out = {};
  for (const line of raw) {
    const [pair, ...attrs] = line.split(';');
    const eq = pair.indexOf('=');
    out[pair.slice(0, eq).trim()] = {
      value: pair.slice(eq + 1),
      attrs: attrs.map((a) => a.trim().toLowerCase()),
    };
  }
  return out;
}

describe('02 · auth & sessions (contract §1.1, §4.1)', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('GET /auth/me logged out returns { user: null, needsOnboarding: false }', async () => {
    const res = await h.get('/auth/me');
    const body = h.expectShape(res, authMeResponseSchema);
    assert.equal(body.user, null);
    assert.equal(body.needsOnboarding, false);
  });

  test('GET /auth/me with a session returns the self profile', async () => {
    const user = await h.createUser({ username: 'kartik', name: 'Kartik Gupta' });
    const res = await h.get('/auth/me', { cookie: user.cookie });
    const body = h.expectShape(res, authMeResponseSchema);

    assert.equal(body.user.username, 'kartik');
    assert.equal(body.needsOnboarding, false);
    assert.equal(body.user.viewer.isSelf, true);
    assert.equal(body.user.viewer.isFollowing, false);
  });

  test('GET /auth/me flags needsOnboarding for a user with no username', async () => {
    const user = await h.createOnboardingUser();
    const res = await h.get('/auth/me', { cookie: user.cookie });
    const body = h.expectShape(res, authMeResponseSchema);

    assert.equal(body.needsOnboarding, true);
    assert.equal(body.user.username, '', 'username is empty string pre-onboarding');
  });

  test('an expired access cookie yields 401 TOKEN_EXPIRED on a required-auth route', async () => {
    const user = await h.createUser();
    const res = await h.get('/notifications/unread-count', {
      cookie: h.expiredAccessCookie(user),
    });
    h.expectError(res, 401, 'TOKEN_EXPIRED');
  });

  test('a forged access cookie yields 401 UNAUTHENTICATED (never TOKEN_EXPIRED)', async () => {
    const user = await h.createUser();
    const res = await h.get('/notifications/unread-count', {
      cookie: h.forgedAccessCookie(user),
    });
    h.expectError(res, 401, 'UNAUTHENTICATED');
  });

  test('a valid token for a deleted user yields 401, not a 500', async () => {
    const user = await h.createUser();
    await h.ctx.prisma.user.delete({ where: { id: user.id } });
    const res = await h.get('/notifications/unread-count', { cookie: user.cookie });
    h.expectError(res, 401, 'UNAUTHENTICATED');
  });

  test('optional-auth routes reject an expired presented cookie', async () => {
    const user = await h.createUser();
    const res = await h.get('/auth/me', { cookie: h.expiredAccessCookie(user) });
    h.expectError(res, 401, 'TOKEN_EXPIRED');
  });

  test('POST /auth/refresh rotates both cookies and invalidates the old refresh token', async () => {
    const user = await h.createUser();
    const { cookie } = await h.issueRefreshSession(user.id);

    const first = await h.post('/auth/refresh', { cookie });
    assert.equal(first.status, 200);
    assert.deepEqual(first.body, { ok: true });

    const cookies = setCookies(first.headers);
    assert.ok(cookies.lo_access, 'must set a new access cookie');
    assert.ok(cookies.lo_refresh, 'must set a new refresh cookie');
    assert.ok(cookies.lo_access.attrs.includes('httponly'), 'access cookie must be httpOnly');
    assert.ok(cookies.lo_refresh.attrs.includes('httponly'), 'refresh cookie must be httpOnly');
    assert.ok(cookies.lo_access.attrs.includes('samesite=lax'));

    const replay = await h.post('/auth/refresh', { cookie });
    h.expectError(replay, 401, 'UNAUTHENTICATED');
  });

  test('POST /auth/refresh without a refresh cookie is 401', async () => {
    h.expectError(await h.post('/auth/refresh'), 401, 'UNAUTHENTICATED');
  });

  test('POST /auth/refresh with a garbage refresh cookie is 401', async () => {
    h.expectError(await h.post('/auth/refresh', { cookie: 'lo_refresh=nonsense' }), 401, 'UNAUTHENTICATED');
  });

  test('POST /auth/refresh with a valid JWT but no DB session is 401', async () => {
    const user = await h.createUser();
    const orphan = h.signJwt({ sub: user.id, jti: 'x' }, h.REFRESH_SECRET, 3600);
    h.expectError(
      await h.post('/auth/refresh', { cookie: `lo_refresh=${orphan}` }),
      401,
      'UNAUTHENTICATED',
    );
  });

  test('POST /auth/logout revokes the refresh session and clears both cookies', async () => {
    const user = await h.createUser();
    const { cookie, token } = await h.issueRefreshSession(user.id);

    const res = await h.post('/auth/logout', { cookie: `${user.cookie}; ${cookie}` });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });

    const cookies = setCookies(res.headers);
    assert.equal(cookies.lo_access.value, '', 'access cookie cleared');
    assert.equal(cookies.lo_refresh.value, '', 'refresh cookie cleared');

    const remaining = await h.ctx.prisma.session.findFirst({
      where: { sessionToken: h.hashRefresh(token) },
    });
    assert.equal(remaining, null, 'refresh session row must be deleted');
  });

  test('POST /auth/logout without any cookie is an idempotent 200 and clears legacy cookies', async () => {
    const res = await h.post('/auth/logout');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
    const cookies = setCookies(res.headers);
    assert.equal(cookies.lo_access.value, '');
    assert.equal(cookies.lo_refresh.value, '');
  });

  test(
    'AUTH-02: logout succeeds with only a refresh cookie (the real state after 15-min expiry)',
    async () => {
      const user = await h.createUser();
      const { cookie, token } = await h.issueRefreshSession(user.id);

      // No lo_access cookie at all — mirrors a browser after the access cookie's Max-Age.
      const res = await h.post('/auth/logout', { cookie });
      assert.equal(res.status, 200, 'logout must not require a live access cookie');

      const cookies = setCookies(res.headers);
      assert.equal(cookies.lo_access.value, '', 'access cookie cleared');
      assert.equal(cookies.lo_refresh.value, '', 'refresh cookie cleared');

      const remaining = await h.ctx.prisma.session.findFirst({
        where: { sessionToken: h.hashRefresh(token) },
      });
      assert.equal(remaining, null, 'the refresh session must be revoked');
    },
  );

  test(
    'AUTH-02: logout is idempotent — a second logout AFTER revocation is still 200',
    async () => {
      const user = await h.createUser();
      const { cookie, token } = await h.issueRefreshSession(user.id);

      const first = await h.post('/auth/logout', { cookie });
      assert.equal(first.status, 200, 'the first logout revokes the session');

      // The session is now revoked; logging out again with the same cookie must not 401.
      const second = await h.post('/auth/logout', { cookie });
      assert.equal(second.status, 200, 'repeat logout after revocation must be an idempotent 200');

      const remaining = await h.ctx.prisma.session.findFirst({
        where: { sessionToken: h.hashRefresh(token) },
      });
      assert.equal(remaining, null, 'the session stays revoked');
    },
  );

  test('GET /auth/github is 503 PROVIDER_NOT_CONFIGURED when creds are absent', async () => {
    const res = await h.get('/auth/github');
    h.expectError(res, 503, 'PROVIDER_NOT_CONFIGURED');
  });

  test('GET /auth/google redirects to the provider and plants a signed state nonce', async () => {
    const res = await h.get('/auth/google');
    assert.equal(res.status, 302);

    const location = new URL(res.headers.get('location'));
    assert.equal(location.hostname, 'accounts.google.com');
    assert.ok(location.searchParams.get('state'), 'must carry signed state');

    const cookies = setCookies(res.headers);
    assert.ok(cookies.lo_oauth_state, 'must set the state nonce cookie');
    assert.ok(cookies.lo_oauth_state.attrs.includes('httponly'));
    assert.ok(
      cookies.lo_oauth_state.attrs.some((a) => a === 'path=/v1/auth'),
      'state cookie must be scoped to /v1/auth',
    );
  });

  test('GET /auth/google?returnTo accepts a relative path', async () => {
    const res = await h.get('/auth/google?returnTo=%2Fls%2F01ARZ3NDEKTSV4RRFFQ69G5FAV');
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location').includes('state='));
  });

  test('GET /auth/google rejects undocumented navigation parameters', async () => {
    const res = await h.get('/auth/google?utm_source=mail');
    const error = h.expectError(res, 400, 'VALIDATION_ERROR');
    assert.equal(error.details[0].field, 'utm_source');
  });

  test('GET /auth/google rejects open-redirect returnTo values', async () => {
    const hostile = [
      'https://evil.example.com',
      '//evil.example.com',
      '/\\evil.example.com',
      'javascript:alert(1)',
      'ls/123',
    ];
    for (const returnTo of hostile) {
      const res = await h.get(`/auth/google?returnTo=${encodeURIComponent(returnTo)}`);
      h.expectError(res, 400, 'VALIDATION_ERROR');
    }
  });

  test('OAuth callback without valid state redirects to the web app with ?error=', async () => {
    const res = await h.get('/auth/google/callback?code=abc&state=tampered');
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.equal(location.origin + location.pathname, `${h.WEB_URL}/auth/callback`);
    assert.equal(location.searchParams.get('error'), 'oauth_failed');
    assert.equal(location.searchParams.get('message'), null);
    assert.deepEqual([...location.searchParams.keys()], ['error']);
  });

  test('OAuth callback surfaces a user cancellation as ?error=access_denied', async () => {
    const res = await h.get('/auth/google/callback?error=access_denied');
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.equal(location.searchParams.get('error'), 'access_denied');
    assert.equal(location.searchParams.get('message'), null);
    assert.deepEqual([...location.searchParams.keys()], ['error']);
  });

  test('every mutating route rejects an anonymous caller with 401', async () => {
    const routes = [
      ['POST', '/ls'],
      ['PATCH', '/users/me'],
      ['GET', '/me/saved'],
      ['GET', '/notifications'],
      ['GET', '/notifications/unread-count'],
      ['POST', '/notifications/read-all'],
      ['GET', '/feed/following'],
      ['POST', '/uploads/avatar'],
    ];
    for (const [method, path] of routes) {
      const res = await h.request(method, path, { body: method === 'GET' ? undefined : {} });
      h.expectError(res, 401, 'UNAUTHENTICATED');
    }
  });
});
