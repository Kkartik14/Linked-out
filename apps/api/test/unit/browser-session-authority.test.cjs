'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
  BROWSER_SESSION_IDLE_TIMEOUT_MS,
  BrowserSessionAuthority,
  hashBrowserSessionCookie,
  hashOAuthHandoffCode,
} = require('@linkedout/session-authority');

const NOW = new Date('2026-01-01T00:00:00.000Z');
const FIRST_TOKEN = 'A'.repeat(43);
const SECOND_TOKEN = 'B'.repeat(43);

function session(overrides = {}) {
  return {
    sid: 'session-1',
    sub: 'user-1',
    createdAt: NOW,
    lastUsedAt: NOW,
    ...overrides,
  };
}

function unusedPersistence(overrides = {}) {
  const unexpected = async () => {
    throw new Error('unexpected persistence call');
  };
  return {
    create: unexpected,
    exchangeOAuthHandoff: unexpected,
    authorize: unexpected,
    revoke: unexpected,
    ...overrides,
  };
}

test('session creation retries a hash collision and returns policy-owned expiries', async () => {
  const inputs = [];
  const tokens = [FIRST_TOKEN, SECOND_TOKEN];
  const authority = new BrowserSessionAuthority(
    unusedPersistence({
      async create(input) {
        inputs.push(input);
        return inputs.length === 1
          ? { kind: 'cookie-hash-conflict' }
          : { kind: 'created', session: session() };
      },
    }),
    {
      clock: { now: () => NOW },
      tokenSource: { generate: () => tokens.shift() },
    },
  );

  const created = await authority.create('user-1');

  assert.equal(created.cookie, SECOND_TOKEN);
  assert.equal(created.cookieExpiresAt.getTime(), NOW.getTime() + BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS);
  assert.equal(created.expiresAt.getTime(), NOW.getTime() + BROWSER_SESSION_IDLE_TIMEOUT_MS);
  assert.deepEqual(
    inputs.map(({ cookieHash, sub, now }) => ({ cookieHash, sub, now })),
    [FIRST_TOKEN, SECOND_TOKEN].map((token) => ({
      cookieHash: hashBrowserSessionCookie(token),
      sub: 'user-1',
      now: NOW,
    })),
  );
});

test('session creation stops after its bounded collision budget', async () => {
  let attempts = 0;
  const authority = new BrowserSessionAuthority(
    unusedPersistence({
      async create() {
        attempts += 1;
        return { kind: 'cookie-hash-conflict' };
      },
    }),
    { clock: { now: () => NOW }, tokenSource: { generate: () => FIRST_TOKEN } },
  );

  await assert.rejects(
    () => authority.create('user-1'),
    /exhausted its collision retry budget/,
  );
  assert.equal(attempts, 3);
});

test('invalid generated credentials and clocks fail before persistence', async () => {
  let calls = 0;
  const persistence = unusedPersistence({
    async create() {
      calls += 1;
      return { kind: 'created', session: session() };
    },
  });
  const invalidToken = new BrowserSessionAuthority(persistence, {
    clock: { now: () => NOW },
    tokenSource: { generate: () => 'predictably-short' },
  });
  await assert.rejects(() => invalidToken.create('user-1'), /invalid token/);

  const invalidClock = new BrowserSessionAuthority(persistence, {
    clock: { now: () => new Date(Number.NaN) },
    tokenSource: { generate: () => FIRST_TOKEN },
  });
  await assert.rejects(() => invalidClock.create('user-1'), /valid Date/);
  assert.equal(calls, 0);
});

test('authorization and revocation pass only hashes, policy timeouts, and the validated clock', async () => {
  const inputs = [];
  const authority = new BrowserSessionAuthority(
    unusedPersistence({
      async authorize(input) {
        inputs.push({ operation: 'authorize', ...input });
        return { kind: 'invalid' };
      },
      async revoke(input) {
        inputs.push({ operation: 'revoke', ...input });
        return { revoked: false };
      },
    }),
    { clock: { now: () => NOW } },
  );

  assert.deepEqual(await authority.authorize(undefined), { kind: 'absent' });
  assert.deepEqual(await authority.authorize('short'), { kind: 'invalid' });
  await authority.authorize(FIRST_TOKEN);
  await authority.revoke(FIRST_TOKEN);

  assert.deepEqual(inputs, [
    {
      operation: 'authorize',
      cookieHash: hashBrowserSessionCookie(FIRST_TOKEN),
      now: NOW,
      idleTimeoutMs: BROWSER_SESSION_IDLE_TIMEOUT_MS,
      absoluteTimeoutMs: BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
    },
    {
      operation: 'revoke',
      cookieHash: hashBrowserSessionCookie(FIRST_TOKEN),
      now: NOW,
    },
  ]);
});

test('OAuth handoff exchange hashes the code and retries only cookie collisions', async () => {
  const inputs = [];
  const tokens = [FIRST_TOKEN, SECOND_TOKEN];
  const authority = new BrowserSessionAuthority(
    unusedPersistence({
      async exchangeOAuthHandoff(input) {
        inputs.push(input);
        return inputs.length === 1
          ? { kind: 'cookie-hash-conflict' }
          : { kind: 'exchanged', session: session(), returnTo: '/home' };
      },
    }),
    {
      clock: { now: () => NOW },
      tokenSource: { generate: () => tokens.shift() },
    },
  );

  assert.equal(await authority.exchangeOAuthHandoff('short'), null);
  const exchanged = await authority.exchangeOAuthHandoff('C'.repeat(43));

  assert.equal(exchanged.cookie, SECOND_TOKEN);
  assert.equal(exchanged.returnTo, '/home');
  assert.deepEqual(
    inputs.map(({ codeHash, cookieHash, now }) => ({ codeHash, cookieHash, now })),
    [FIRST_TOKEN, SECOND_TOKEN].map((token) => ({
      codeHash: hashOAuthHandoffCode('C'.repeat(43)),
      cookieHash: hashBrowserSessionCookie(token),
      now: NOW,
    })),
  );
});
