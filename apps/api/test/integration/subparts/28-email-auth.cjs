'use strict';

const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');
const { emailOtpRequestAcceptedSchema } = require('@linkedout/contracts');

const h = require('../_harness.cjs');
const {
  PrismaCleanupPersistence,
} = require('../../../dist/maintenance/prisma-cleanup.persistence');

const EMAIL = 'Kartik.Email+otp@Example.COM';
const CANONICAL_EMAIL = 'kartik.email+otp@example.com';
const PASSWORD = 'a correct horse battery staple';
const NEW_PASSWORD = 'a different horse battery staple';

function inspect(email, purpose, secret = h.EMAIL_OTP_INSPECTION_SECRET) {
  return h.post('/auth/email/otp/inspect', {
    headers: { 'x-linkedout-otp-inspection': secret },
    body: { email, purpose },
  });
}

async function requestSignup(overrides = {}) {
  return h.post('/auth/email/signup', {
    body: { email: EMAIL, password: PASSWORD, ...overrides },
  });
}

async function exchange(code) {
  return h.post('/auth/oauth/handoff/exchange', {
    headers: { 'x-internal-auth': h.authExchangeAssertion() },
    body: { code },
  });
}

describe('28 · email/password authentication with OTP', () => {
  beforeEach(h.resetDb);

  test('signup creates one encrypted, ten-minute, inspectable OTP and never stores the code', async () => {
    const startedAt = Date.now();
    const signup = await requestSignup();
    h.expectShape(signup, emailOtpRequestAcceptedSchema, 202);
    assert.deepEqual(signup.body, { accepted: true, expiresInSeconds: 600 });

    h.expectError(await inspect(EMAIL, 'SIGNUP', 'wrong-secret'), 401, 'UNAUTHENTICATED');
    const inspected = await inspect(EMAIL, 'SIGNUP');
    assert.equal(inspected.status, 200, JSON.stringify(inspected.body));
    assert.match(inspected.body.otp, /^\d{8}$/);
    assert.equal(inspected.body.email, CANONICAL_EMAIL);
    assert.equal(inspected.body.purpose, 'SIGNUP');
    assert.equal(inspected.headers.get('cache-control'), 'private, no-store, max-age=0');

    const challenge = await h.ctx.prisma.emailOtpChallenge.findUniqueOrThrow({
      where: { email_purpose: { email: CANONICAL_EMAIL, purpose: 'SIGNUP' } },
      include: { outbox: true },
    });
    assert.equal(challenge.codeDigest.includes(inspected.body.otp), false);
    assert.equal(challenge.outbox.ciphertext.includes(inspected.body.otp), false);
    assert.equal(challenge.passwordHash.includes(PASSWORD), false);
    assert.ok(challenge.expiresAt.getTime() >= startedAt + 599_000);
    assert.ok(challenge.expiresAt.getTime() <= Date.now() + 600_000);
  });

  test('concurrent same-email requests reuse one active OTP for the full ten-minute window', async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => requestSignup()));
    assert.ok(responses.every(({ status }) => status === 202));
    assert.equal(await h.ctx.prisma.emailOtpChallenge.count(), 1);
    assert.equal(await h.ctx.prisma.emailOtpOutbox.count(), 1);

    const first = await inspect(EMAIL, 'SIGNUP');
    const resent = await h.post('/auth/email/resend', {
      body: { email: CANONICAL_EMAIL, purpose: 'SIGNUP' },
    });
    assert.equal(resent.status, 202, JSON.stringify(resent.body));
    const second = await inspect(EMAIL, 'SIGNUP');
    assert.equal(second.body.otp, first.body.otp);
  });

  test('per-email issuance abuse is capped with a usable Retry-After response', async () => {
    const rateLimitedEmail = 'rate-limited-email-auth@example.com';
    let limited;
    for (let attempt = 1; attempt <= 11; attempt += 1) {
      const response = await requestSignup({ email: rateLimitedEmail });
      if (response.status === 429) {
        limited = response;
        break;
      }
      assert.equal(response.status, 202);
    }
    assert.ok(limited, 'the per-email budget must cap repeated issuance');
    h.expectError(limited, 429, 'RATE_LIMITED');
    assert.match(limited.headers.get('retry-after'), /^\d+$/);
  });

  test('verification is one-time, creates a verified password account, and issues the normal handoff', async () => {
    await requestSignup();
    const { body: delivery } = await inspect(EMAIL, 'SIGNUP');

    const verified = await h.post('/auth/email/verify', {
      body: { email: EMAIL, otp: delivery.otp, returnTo: '/feed' },
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.match(verified.body.code, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(verified.body.returnTo, '/feed');

    const user = await h.ctx.prisma.user.findUniqueOrThrow({
      where: { email: CANONICAL_EMAIL },
      include: { passwordCredential: true },
    });
    assert.ok(user.emailVerified instanceof Date);
    assert.ok(user.passwordCredential.passwordHash.startsWith('$argon2id$'));

    h.expectError(
      await h.post('/auth/email/verify', {
        body: { email: EMAIL, otp: delivery.otp, returnTo: '/feed' },
      }),
      400,
      'INVALID_OTP',
    );
    const session = await exchange(verified.body.code);
    assert.equal(session.status, 200, JSON.stringify(session.body));
    assert.equal((await h.ctx.prisma.browserSession.findMany())[0].sub, user.id);
  });

  test('two simultaneous correct verifications produce exactly one account and one handoff', async () => {
    await requestSignup();
    const otp = (await inspect(EMAIL, 'SIGNUP')).body.otp;
    const attempts = await Promise.all(
      Array.from({ length: 2 }, () =>
        h.post('/auth/email/verify', {
          body: { email: EMAIL, otp, returnTo: '/' },
        }),
      ),
    );
    assert.equal(attempts.filter(({ status }) => status === 200).length, 1);
    assert.equal(attempts.filter(({ status }) => status === 400).length, 1);
    assert.equal(await h.ctx.prisma.user.count({ where: { email: CANONICAL_EMAIL } }), 1);
    assert.equal(await h.ctx.prisma.oAuthHandoff.count(), 1);
  });

  test('wrong OTPs are bounded and never mutate the pending account', async () => {
    await requestSignup();
    const actualOtp = (await inspect(EMAIL, 'SIGNUP')).body.otp;
    const wrongOtp = actualOtp === '00000000' ? '00000001' : '00000000';
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      h.expectError(
        await h.post('/auth/email/verify', {
          body: { email: EMAIL, otp: wrongOtp, returnTo: '/' },
        }),
        400,
        'INVALID_OTP',
      );
    }
    h.expectError(
      await h.post('/auth/email/verify', {
        body: { email: EMAIL, otp: '11111111', returnTo: '/' },
      }),
      400,
      'INVALID_OTP',
    );
    assert.equal(await h.ctx.prisma.user.count(), 0);
    assert.equal((await h.ctx.prisma.emailOtpChallenge.findFirstOrThrow()).failedAttempts, 5);
  });

  test('password login is generic on failure and returns a one-time handoff on success', async () => {
    await requestSignup();
    const { body: delivery } = await inspect(EMAIL, 'SIGNUP');
    await h.post('/auth/email/verify', {
      body: { email: EMAIL, otp: delivery.otp, returnTo: '/' },
    });

    for (const body of [
      { email: EMAIL, password: 'this password is incorrect', returnTo: '/' },
      { email: 'nobody@example.com', password: PASSWORD, returnTo: '/' },
    ]) {
      h.expectError(await h.post('/auth/email/login', { body }), 401, 'INVALID_CREDENTIALS');
    }

    const login = await h.post('/auth/email/login', {
      body: { email: EMAIL, password: PASSWORD, returnTo: '/feed' },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.match(login.body.code, /^[A-Za-z0-9_-]{43}$/);
    assert.equal((await exchange(login.body.code)).status, 200);
    h.expectError(await exchange(login.body.code), 400, 'INVALID_HANDOFF');
  });

  test('forgot password is non-enumerating; reset consumes the OTP and revokes every session', async () => {
    const unknown = await h.post('/auth/email/password/forgot', {
      body: { email: 'nobody@example.com' },
    });
    assert.equal(unknown.status, 202);
    assert.deepEqual(unknown.body, { accepted: true, expiresInSeconds: 600 });

    await requestSignup();
    const signupOtp = (await inspect(EMAIL, 'SIGNUP')).body.otp;
    const verified = await h.post('/auth/email/verify', {
      body: { email: EMAIL, otp: signupOtp, returnTo: '/' },
    });
    const browser = await exchange(verified.body.code);
    const user = await h.ctx.prisma.user.findUniqueOrThrow({ where: { email: CANONICAL_EMAIL } });
    await h.issueRefreshSession(user.id);

    const forgot = await h.post('/auth/email/password/forgot', { body: { email: EMAIL } });
    assert.equal(forgot.status, 202);
    assert.deepEqual(forgot.body, unknown.body);
    const resetOtp = (await inspect(EMAIL, 'PASSWORD_RESET')).body.otp;

    const reset = await h.post('/auth/email/password/reset', {
      body: { email: EMAIL, otp: resetOtp, newPassword: NEW_PASSWORD },
    });
    assert.equal(reset.status, 200, JSON.stringify(reset.body));
    assert.deepEqual(reset.body, { ok: true });
    assert.equal(await h.ctx.prisma.session.count({ where: { userId: user.id } }), 0);
    assert.ok((await h.ctx.prisma.browserSession.findFirstOrThrow()).revokedAt instanceof Date);

    h.expectError(
      await h.post('/auth/email/login', {
        body: { email: EMAIL, password: PASSWORD, returnTo: '/' },
      }),
      401,
      'INVALID_CREDENTIALS',
    );
    assert.equal(
      (await h.post('/auth/email/login', {
        body: { email: EMAIL, password: NEW_PASSWORD, returnTo: '/' },
      })).status,
      200,
    );
    assert.equal(browser.body.cookie.length, 43);
  });

  test('expired codes fail generically and bounded cleanup cascades the encrypted capture', async () => {
    await requestSignup();
    const otp = (await inspect(EMAIL, 'SIGNUP')).body.otp;
    await h.ctx.prisma.emailOtpChallenge.updateMany({
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    h.expectError(
      await h.post('/auth/email/verify', {
        body: { email: EMAIL, otp, returnTo: '/' },
      }),
      400,
      'INVALID_OTP',
    );
    const cleanup = new PrismaCleanupPersistence(h.ctx.prisma);
    assert.equal(await cleanup.deleteExpiredBatch('emailOtpChallenges', new Date(), 1), 1);
    assert.equal(await h.ctx.prisma.emailOtpChallenge.count(), 0);
    assert.equal(await h.ctx.prisma.emailOtpOutbox.count(), 0);
  });
});
