'use strict';

const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const test = require('node:test');

const {
  InternalAssertionSigner,
  InternalAssertionVerifier,
} = require('@linkedout/internal-auth');
const {
  NestRequestAuthentication,
} = require('../../dist/modules/auth/nest-request-authentication');

const SECRET = 'internal-api-test-secret-0123456789abcdef';
const OTHER_SECRET = 'different-internal-secret-0123456789abc';
const NOW = new Date('2026-07-17T12:00:00.000Z');
const USER_ID = '01K0E8Z6D8G9J2M4P6R8T0V2WX';
const SESSION_ID = '01K0E8Z6D8G9J2M4P6R8T0V2WY';

function rawAssertion(payload, header = { alg: 'HS256', typ: 'linkedout+bff-api' }, secret = SECRET) {
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

test('internal API assertions are short-lived, exact, and purpose-scoped', () => {
  const clock = { now: () => NOW };
  const signer = new InternalAssertionSigner(SECRET, clock);
  const verifier = new InternalAssertionVerifier(SECRET, clock);
  const api = signer.signApi({ sub: USER_ID, sid: SESSION_ID });

  assert.deepEqual(verifier.verifyApi(undefined), { kind: 'absent' });
  const verified = verifier.verifyApi(api);
  assert.equal(verified.kind, 'authenticated');
  assert.equal(verified.claims.sub, USER_ID);
  assert.equal(verified.claims.sid, SESSION_ID);
  assert.equal(verified.claims.exp - verified.claims.iat, 60);
  assert.deepEqual(verifier.verifyAuthExchange(api), { kind: 'invalid' });

  const exchange = signer.signAuthExchange();
  assert.equal(verifier.verifyAuthExchange(exchange).kind, 'authenticated');
  assert.deepEqual(verifier.verifyApi(exchange), { kind: 'invalid' });
  assert.deepEqual(new InternalAssertionVerifier(OTHER_SECRET, clock).verifyApi(api), {
    kind: 'invalid',
  });

  const atExpiry = new InternalAssertionVerifier(SECRET, {
    now: () => new Date(NOW.getTime() + 60_000),
  });
  assert.deepEqual(atExpiry.verifyApi(api), { kind: 'expired' });
});

test('internal assertion verification rejects broader or malformed claim profiles', () => {
  const now = Math.floor(NOW.getTime() / 1000);
  const verifier = new InternalAssertionVerifier(SECRET, { now: () => NOW });
  const base = {
    sub: USER_ID,
    sid: SESSION_ID,
    iss: 'bff',
    aud: 'api',
    iat: now,
    exp: now + 60,
  };

  assert.deepEqual(verifier.verifyApi(rawAssertion({ ...base, exp: now + 61 })), { kind: 'invalid' });
  assert.deepEqual(verifier.verifyApi(rawAssertion({ ...base, role: 'admin' })), { kind: 'invalid' });
  assert.deepEqual(
    verifier.verifyApi(rawAssertion(base, { alg: 'HS256', typ: 'JWT' })),
    { kind: 'invalid' },
  );
  assert.deepEqual(verifier.verifyApi(rawAssertion({ ...base, aud: 'auth-exchange' })), {
    kind: 'invalid',
  });
  assert.deepEqual(verifier.verifyApi('x'.repeat(2049)), { kind: 'invalid' });
  assert.throws(() => new InternalAssertionSigner('too-short'), /at least 32 bytes/i);
  assert.throws(
    () => new InternalAssertionSigner(SECRET).signApi({ sub: 'not-ulid', sid: SESSION_ID }),
    /sub must be a ULID/i,
  );
});

test('Nest request authentication hydrates the principal and propagates infrastructure failure', async () => {
  const signer = new InternalAssertionSigner(SECRET);
  const assertion = signer.signApi({ sub: USER_ID, sid: SESSION_ID });
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
