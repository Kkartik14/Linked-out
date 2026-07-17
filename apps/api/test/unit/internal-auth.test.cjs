'use strict';

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const {
  ApiAssertionSigner,
  ApiAssertionVerifier,
  BffCallerAssertionSigner,
  BffCallerAssertionVerifier,
} = require('@linkedout/internal-auth');
const {
  NestRequestAuthentication,
} = require('../../dist/modules/auth/nest-request-authentication');

const SECRET = 'internal-api-test-secret-0123456789abcdef';
const BFF_CALLER_SECRET = 'bff-caller-test-secret-0123456789abcdef';
const NOW = new Date('2026-07-17T12:00:00.000Z');
const USER_ID = '01K0E8Z6D8G9J2M4P6R8T0V2WX';
const SESSION_ID = '01K0E8Z6D8G9J2M4P6R8T0V2WY';

function rawAssertion(payload, header = { alg: 'HS256', typ: 'linkedout+api-session' }, secret = SECRET) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

test('BFF caller and API assertions have separate keys, issuers, and purposes', () => {
  const clock = { now: () => NOW };
  const apiSigner = new ApiAssertionSigner(SECRET, clock);
  const apiVerifier = new ApiAssertionVerifier(SECRET, clock);
  const callerSigner = new BffCallerAssertionSigner(BFF_CALLER_SECRET, clock);
  const callerVerifier = new BffCallerAssertionVerifier(BFF_CALLER_SECRET, clock);
  const signedApi = apiSigner.sign({ sub: USER_ID, sid: SESSION_ID });
  const api = signedApi.assertion;

  assert.deepEqual(apiVerifier.verify(undefined), { kind: 'absent' });
  const verified = apiVerifier.verify(api);
  assert.equal(verified.kind, 'authenticated');
  assert.equal(verified.claims.sub, USER_ID);
  assert.equal(verified.claims.sid, SESSION_ID);
  assert.equal(verified.claims.exp - verified.claims.iat, 60);
  assert.equal(signedApi.expiresAt.toISOString(), '2026-07-17T12:01:00.000Z');

  const exchange = callerSigner.signAuthExchange();
  const resolve = callerSigner.signSessionResolve();
  const revoke = callerSigner.signSessionRevoke();
  assert.equal(callerVerifier.verify(exchange, 'auth-exchange').kind, 'authenticated');
  assert.equal(callerVerifier.verify(resolve, 'session-resolve').kind, 'authenticated');
  assert.equal(callerVerifier.verify(revoke, 'session-revoke').kind, 'authenticated');
  assert.deepEqual(callerVerifier.verify(exchange, 'session-resolve'), { kind: 'invalid' });
  assert.deepEqual(callerVerifier.verify(resolve, 'session-revoke'), { kind: 'invalid' });
  assert.deepEqual(apiVerifier.verify(exchange), { kind: 'invalid' });
  assert.deepEqual(new ApiAssertionVerifier(BFF_CALLER_SECRET, clock).verify(api), {
    kind: 'invalid',
  });

  const atExpiry = new ApiAssertionVerifier(SECRET, {
    now: () => new Date(NOW.getTime() + 60_000),
  });
  assert.deepEqual(atExpiry.verify(api), { kind: 'expired' });
});

test('internal assertion verification rejects broader or malformed claim profiles', () => {
  const now = Math.floor(NOW.getTime() / 1000);
  const verifier = new ApiAssertionVerifier(SECRET, { now: () => NOW });
  const base = {
    sub: USER_ID,
    sid: SESSION_ID,
    iss: 'linkedout-api',
    aud: 'api',
    iat: now,
    exp: now + 60,
  };

  assert.deepEqual(verifier.verify(rawAssertion({ ...base, exp: now + 61 })), { kind: 'invalid' });
  assert.deepEqual(verifier.verify(rawAssertion({ ...base, role: 'admin' })), { kind: 'invalid' });
  assert.deepEqual(
    verifier.verify(rawAssertion(base, { alg: 'HS256', typ: 'JWT' })),
    { kind: 'invalid' },
  );
  assert.deepEqual(verifier.verify(rawAssertion({ ...base, aud: 'auth-exchange' })), {
    kind: 'invalid',
  });
  assert.deepEqual(verifier.verify('x'.repeat(2049)), { kind: 'invalid' });
  assert.throws(() => new ApiAssertionSigner('too-short'), /at least 32 bytes/i);
  assert.throws(
    () => new ApiAssertionSigner(SECRET).sign({ sub: 'not-ulid', sid: SESSION_ID }),
    /sub must be a ULID/i,
  );
});

test('Nest request authentication hydrates the principal and propagates infrastructure failure', async () => {
  const signer = new ApiAssertionSigner(SECRET);
  const assertion = signer.sign({ sub: USER_ID, sid: SESSION_ID }).assertion;
  const config = { internalApiSecret: SECRET };
  const principal = { id: USER_ID, username: 'kartik' };
  const auth = new NestRequestAuthentication(config, {
    async resolve() {
      return principal;
    },
  });
  assert.deepEqual(await auth.authenticateInternal(assertion), {
    kind: 'authenticated',
    user: principal,
    sid: SESSION_ID,
  });

  const outage = new Error('principal store unavailable');
  const unavailable = new NestRequestAuthentication(config, {
    async resolve() {
      throw outage;
    },
  });
  await assert.rejects(() => unavailable.authenticateInternal(assertion), outage);

  const disabled = new NestRequestAuthentication({ internalApiSecret: undefined }, {
    async resolve() {
      assert.fail('disabled internal auth must not query a principal');
    },
  });
  assert.deepEqual(await disabled.authenticateInternal(assertion), { kind: 'invalid' });
});
