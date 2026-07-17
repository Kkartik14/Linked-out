'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { AuthController } = require('../../dist/modules/auth/auth.controller');
const {
  AuthExchangeGuard,
} = require('../../dist/modules/auth/auth-exchange.guard');
const {
  OAuthHandoffService,
} = require('../../dist/modules/auth/oauth-handoff.service');
const { InternalAssertionSigner } = require('@linkedout/internal-auth');

const INTERNAL_SECRET = 'unit-internal-secret-at-least-32-bytes';
const USER = { id: '01ARZ3NDEKTSV4RRFFQ69G5FAV', username: 'kartik' };

function appError(error, status, code) {
  assert.equal(error.getStatus(), status);
  assert.equal(error.getResponse().code, code);
  return true;
}

function httpContext(header) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers: header === undefined ? {} : { 'x-internal-auth': header } }),
    }),
  };
}

function responseRecorder() {
  return {
    headers: {},
    cleared: [],
    redirects: [],
    setHeader(name, value) {
      this.headers[name] = value;
    },
    clearCookie(name, options) {
      this.cleared.push({ name, options });
    },
    redirect(location) {
      this.redirects.push(location);
    },
  };
}

test('AuthExchangeGuard accepts only the purpose-scoped BFF assertion', () => {
  const guard = new AuthExchangeGuard({ internalApiSecret: INTERNAL_SECRET });
  const signer = new InternalAssertionSigner(INTERNAL_SECRET);

  assert.equal(guard.canActivate(httpContext(signer.signAuthExchange())), true);
  assert.throws(
    () => guard.canActivate(httpContext(signer.signApi({ sub: USER.id, sid: USER.id }))),
    (error) => appError(error, 401, 'UNAUTHENTICATED'),
  );
  assert.throws(
    () => guard.canActivate(httpContext(undefined)),
    (error) => appError(error, 401, 'UNAUTHENTICATED'),
  );
  assert.throws(
    () => guard.canActivate(httpContext(['one', 'two'])),
    (error) => appError(error, 401, 'UNAUTHENTICATED'),
  );
});

test('handoff mode creates no legacy session or browser credential', async () => {
  let issueInput;
  let legacyStarted = false;
  let authCookiesSet = false;
  let authCookiesCleared = false;
  const controller = new AuthController(
    { startSession: async () => { legacyStarted = true; } },
    {
      setAuthCookies: () => { authCookiesSet = true; },
      clearAuthCookies: () => { authCookiesCleared = true; },
    },
    {},
    {
      oauthSessionMode: 'handoff',
      oauthStateCookieDomain: undefined,
      webUrl: 'https://linkedout.example',
    },
    {
      issue: async (sub, returnTo) => {
        issueInput = { sub, returnTo };
        return 'A'.repeat(43);
      },
    },
  );
  const response = responseRecorder();

  await controller.googleCallback(
    USER,
    { oauthReturnTo: '/journey?view=recent', query: {} },
    response,
  );

  assert.deepEqual(issueInput, { sub: USER.id, returnTo: '/journey?view=recent' });
  assert.equal(legacyStarted, false);
  assert.equal(authCookiesSet, false);
  assert.equal(authCookiesCleared, true);
  assert.deepEqual(response.redirects, [
    `https://linkedout.example/auth/callback?code=${'A'.repeat(43)}`,
  ]);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('legacy callback mode remains available during the compatibility window', async () => {
  let issuedHandoff = false;
  let authCookies;
  const refreshToken = 'legacy-refresh';
  const controller = new AuthController(
    { startSession: async () => ({ refreshToken }) },
    {
      setAuthCookies: (_response, user, token) => { authCookies = { user, token }; },
      clearAuthCookies: () => assert.fail('legacy success must not clear its new cookies'),
    },
    {},
    {
      oauthSessionMode: 'legacy',
      oauthStateCookieDomain: '.linkedout.example',
      webUrl: 'https://linkedout.example',
    },
    { issue: async () => { issuedHandoff = true; } },
  );
  const response = responseRecorder();

  await controller.githubCallback(USER, { oauthReturnTo: '/feed', query: {} }, response);

  assert.equal(issuedHandoff, false);
  assert.deepEqual(authCookies, { user: USER, token: refreshToken });
  assert.deepEqual(response.redirects, [
    'https://linkedout.example/auth/callback?returnTo=%2Ffeed',
  ]);
});

test('OAuthHandoffService never persists the raw code', async () => {
  let persisted;
  const service = new OAuthHandoffService({
    create: async (input) => {
      persisted = input;
      return true;
    },
  });

  const code = await service.issue(USER.id, '/feed');
  assert.match(code, /^[A-Za-z0-9_-]{43}$/);
  assert.equal('code' in persisted, false);
  assert.match(persisted.codeHash, /^[a-f0-9]{64}$/);
  assert.equal(persisted.codeHash.includes(code), false);
  assert.equal(persisted.sub, USER.id);
  assert.equal(persisted.returnTo, '/feed');
  assert.equal(persisted.expiresAt.getTime() - persisted.createdAt.getTime(), 60_000);
});

test('handoff persistence failures remain infrastructure failures', async () => {
  const outage = new Error('database unavailable');
  const controller = new AuthController(
    {},
    {},
    {},
    {},
    { exchange: async () => { throw outage; } },
  );
  const response = responseRecorder();

  await assert.rejects(
    () => controller.exchangeOAuthHandoff(response, { code: 'A'.repeat(43) }),
    outage,
  );
});
