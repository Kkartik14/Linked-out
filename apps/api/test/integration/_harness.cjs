'use strict';

/**
 * Integration harness — boots the REAL NestJS server against a REAL Postgres and
 * exercises it over HTTP. Nothing here is mocked.
 *
 * Every response is validated against the Zod schema the frontend imports from
 * `@linkedout/contracts`, so a shape drift fails the suite rather than production.
 *
 * Prereqs: `pnpm db:up` and a `linkedout_test` database with migrations applied
 * (see test/integration/README.md).
 */

const { spawn } = require('node:child_process');
const { createHash, createHmac } = require('node:crypto');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const assert = require('node:assert/strict');

const { ulid } = require('ulid');
const { createPrismaClient } = require('@linkedout/db');

const { guardedReset } = require('../../../../scripts/db-safety-guard.cjs');

const API_ROOT = path.resolve(__dirname, '..', '..');
const MAIN_JS = path.join(API_ROOT, 'dist', 'main.js');

const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public';

const ACCESS_SECRET = 'test-access-secret-0123456789abcdefghij';
const REFRESH_SECRET = 'test-refresh-secret-0123456789abcdefghij';

const PORT = Number(process.env.TEST_API_PORT ?? 4010);
const NO_UPLOADS_PORT = PORT + 1;
const WEB_URL = 'http://localhost:3100';

/** Fake but well-formed R2 config — presigning is pure local crypto, no network. */
const R2_ENV = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access-key-id',
  R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
  R2_BUCKET: 'test-avatars',
  R2_PUBLIC_BASE_URL: 'https://cdn.test.linkedout.app',
  R2_ENDPOINT: 'https://test-account.r2.cloudflarestorage.com',
};

const ctx = {
  /** Base URL of the main server, e.g. http://127.0.0.1:4010/v1 */
  baseUrl: '',
  /** V2 base URL on the same server. */
  v2BaseUrl: '',
  /** Base URL of the second server booted without R2 (uploads disabled). */
  noUploadsBaseUrl: '',
  prisma: null,
  publicBaseUrl: R2_PUBLIC_BASE_URL(),
  webUrl: WEB_URL,
};

function R2_PUBLIC_BASE_URL() {
  return 'https://cdn.test.linkedout.app';
}

// ─── JWT (HS256) ──────────────────────────────────────────────────────────────

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

/** Mints an access/refresh JWT exactly as @nestjs/jwt would (HS256, `exp` in seconds). */
function signJwt(payload, secret, expiresInSeconds) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: nowSec, exp: nowSec + expiresInSeconds }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/** A valid `lo_access` cookie for a user that must already exist in the DB. */
function accessCookie(user) {
  const token = signJwt({ sub: user.id, username: user.username ?? null }, ACCESS_SECRET, 900);
  return `lo_access=${token}`;
}

/** An access cookie whose `exp` is in the past — drives the TOKEN_EXPIRED path. */
function expiredAccessCookie(user) {
  const token = signJwt({ sub: user.id, username: user.username ?? null }, ACCESS_SECRET, -60);
  return `lo_access=${token}`;
}

/** An access cookie signed with the wrong secret. */
function forgedAccessCookie(user) {
  const token = signJwt({ sub: user.id, username: user.username ?? null }, 'not-the-secret-xxxxxx', 900);
  return `lo_access=${token}`;
}

function hashRefresh(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Issues a refresh token AND persists the matching Session row, mirroring
 * AuthService.startSession — so POST /auth/refresh can rotate it for real.
 */
async function issueRefreshSession(userId) {
  const token = signJwt({ sub: userId, jti: ulid() }, REFRESH_SECRET, 30 * 24 * 60 * 60);
  await ctx.prisma.session.create({
    data: {
      userId,
      sessionToken: hashRefresh(token),
      expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  return { token, cookie: `lo_refresh=${token}` };
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/**
 * One HTTP call against the API. Returns status, parsed body, and headers.
 * Redirects are never followed so 302 contracts can be asserted.
 */
async function request(method, pathname, options = {}) {
  const base = options.baseUrl ?? ctx.baseUrl;
  const headers = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  Object.assign(headers, options.headers ?? {});

  const res = await fetch(`${base}${pathname}`, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    redirect: 'manual',
  });

  const text = await res.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: res.status, body, headers: res.headers, text };
}

const get = (p, o) => request('GET', p, o);
const post = (p, o) => request('POST', p, o);
const patch = (p, o) => request('PATCH', p, o);
const put = (p, o) => request('PUT', p, o);
const del = (p, o) => request('DELETE', p, o);

// ─── Assertions ───────────────────────────────────────────────────────────────

/**
 * Asserts a response is a 2xx AND that its body satisfies the shared contract
 * schema. This is the "verify against expected" seam: the frontend imports the
 * same schema, so anything that passes here cannot break the client's types.
 */
function expectShape(res, schema, expectedStatus = 200) {
  assert.equal(
    res.status,
    expectedStatus,
    `expected ${expectedStatus}, got ${res.status}: ${JSON.stringify(res.body)}\n${children.map((child) => child.stderrBuf).join('\n')}`,
  );
  const parsed = schema.safeParse(res.body);
  if (!parsed.success) {
    assert.fail(
      `response violates contract schema:\n${JSON.stringify(parsed.error.issues, null, 2)}\nbody: ${JSON.stringify(res.body, null, 2)}`,
    );
  }
  return parsed.data;
}

/** Asserts the standard `{ error: { code, message, details? } }` envelope. */
function expectError(res, status, code) {
  assert.equal(
    res.status,
    status,
    `expected HTTP ${status}, got ${res.status}: ${JSON.stringify(res.body)}`,
  );
  assert.ok(res.body && typeof res.body === 'object', 'error body must be an object');
  assert.ok(res.body.error, `missing error envelope: ${JSON.stringify(res.body)}`);
  assert.equal(res.body.error.code, code, `expected code ${code}, got ${res.body.error.code}`);
  assert.equal(typeof res.body.error.message, 'string');
  assert.ok(res.body.error.message.length > 0, 'error.message must be non-empty');
  return res.body.error;
}

// ─── DB fixtures ──────────────────────────────────────────────────────────────

const TABLES = [
  'AvatarDeletionClaim',
  'Notification',
  'CollectionL',
  'Collection',
  'Follow',
  'Comment',
  'Reaction',
  'DailyLSelection',
  'L',
  'BrowserSession',
  'Session',
  'Account',
  'VerificationToken',
  'User',
  'RateLimitBucket',
];

async function resetDb() {
  // TEST-01: verify (name allowlist + session role + fingerprinted marker) and TRUNCATE in ONE
  // transaction, so the connection can't be swapped between the check and the destructive SQL.
  const list = TABLES.map((t) => `"${t}"`).join(', ');
  await guardedReset(ctx.prisma, {
    url: DATABASE_URL,
    statements: [`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`],
  });
}

/** Clears only the shared limiter buckets (tests are not about rate limits). */
async function resetRateLimits() {
  await guardedReset(ctx.prisma, {
    url: DATABASE_URL,
    statements: ['TRUNCATE TABLE "RateLimitBucket";'],
  });
}

let userSeq = 0;

/** `undefined` takes the default; an explicit `null` is honoured as a real null. */
function withDefault(overrides, key, fallback) {
  return key in overrides ? overrides[key] : fallback;
}

async function createUser(overrides = {}) {
  userSeq += 1;
  const username = withDefault(overrides, 'username', `user${userSeq}`);
  const user = await ctx.prisma.user.create({
    data: {
      username,
      email: withDefault(overrides, 'email', `${username ?? `anon${userSeq}`}@example.com`),
      name: withDefault(overrides, 'name', `User ${userSeq}`),
      image: withDefault(overrides, 'image', null),
      bio: withDefault(overrides, 'bio', null),
      status: withDefault(overrides, 'status', null),
    },
  });
  return { ...user, cookie: accessCookie(user) };
}

/** A user who has authenticated but not chosen a username yet. */
function createOnboardingUser(overrides = {}) {
  return createUser({ ...overrides, username: null });
}

async function createL(authorId, overrides = {}) {
  return ctx.prisma.l.create({
    data: {
      authorId,
      title: overrides.title ?? 'Rejected after the final round',
      story: overrides.story ?? 'Four rounds in, strong signals, and then silence.',
      type: overrides.type ?? 'L',
      category: overrides.category ?? 'INTERVIEWS',
      company: overrides.company ?? null,
      tags: overrides.tags ?? [],
      eventDate: overrides.eventDate ?? null,
      visibility: overrides.visibility ?? 'PUBLIC',
      isAnonymous: overrides.isAnonymous ?? false,
      resolvedAt: overrides.resolvedAt ?? null,
      ...(overrides.counters ?? {}),
    },
  });
}

async function follow(followerId, followingId) {
  return ctx.prisma.follow.create({ data: { followerId, followingId } });
}

// ─── Server lifecycle ─────────────────────────────────────────────────────────

const children = [];

function baseEnv(port, extra) {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    NODE_ENV: 'test',
    PORT: String(port),
    API_BASE_URL: `http://127.0.0.1:${port}`,
    WEB_URL,
    TRUST_PROXY_HOPS: '0',
    DATABASE_URL,
    DIRECT_URL: DATABASE_URL,
    JWT_ACCESS_SECRET: ACCESS_SECRET,
    JWT_REFRESH_SECRET: REFRESH_SECRET,
    COOKIE_DOMAIN: '',
    GOOGLE_CLIENT_ID: 'test-google-client-id',
    GOOGLE_CLIENT_SECRET: 'test-google-client-secret',
    // GitHub intentionally left unconfigured on the main server so the
    // PROVIDER_NOT_CONFIGURED path is exercised against a real boot.
    GITHUB_CLIENT_ID: '',
    GITHUB_CLIENT_SECRET: '',
    ...extra,
  };
}

async function waitForServer(baseUrl, child, timeoutMs = 40_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`API exited early (code ${child.exitCode}). Stderr:\n${child.stderrBuf}`);
    }
    try {
      const res = await fetch(`${baseUrl}/meta/enums`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await delay(150);
  }
  throw new Error(`API did not start within ${timeoutMs}ms. Stderr:\n${child.stderrBuf}`);
}

function spawnApi(port, env) {
  // cwd is a directory with no .env so @nestjs/config cannot shadow our test env.
  const child = spawn(process.execPath, [MAIN_JS], {
    cwd: path.join(API_ROOT, 'dist'),
    env: baseEnv(port, env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderrBuf = '';
  child.stdout.on('data', () => {});
  child.stderr.on('data', (chunk) => {
    child.stderrBuf += String(chunk);
  });
  children.push(child);
  return child;
}

async function start() {
  ctx.prisma = createPrismaClient({ datasources: { db: { url: DATABASE_URL } } });
  await ctx.prisma.$connect();
  // The fingerprinted marker is planted out-of-band (scripts/bootstrap-test-db.cjs, run before
  // migrate). resetDb() fails closed here if it is absent.
  await resetDb();

  const main = spawnApi(PORT, R2_ENV);
  ctx.baseUrl = `http://127.0.0.1:${PORT}/v1`;
  ctx.v2BaseUrl = `http://127.0.0.1:${PORT}/v2`;

  const noUploads = spawnApi(NO_UPLOADS_PORT, {
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: 'test-avatars',
    R2_PUBLIC_BASE_URL: '',
    R2_ENDPOINT: '',
  });
  ctx.noUploadsBaseUrl = `http://127.0.0.1:${NO_UPLOADS_PORT}/v1`;

  await Promise.all([
    waitForServer(ctx.baseUrl, main),
    waitForServer(ctx.noUploadsBaseUrl, noUploads),
  ]);
}

async function stop() {
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGTERM');
  }
  await delay(200);
  for (const child of children) {
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  if (ctx.prisma) await ctx.prisma.$disconnect();
}

module.exports = {
  ctx,
  start,
  stop,
  request,
  get,
  post,
  patch,
  put,
  del,
  expectShape,
  expectError,
  resetDb,
  resetRateLimits,
  createUser,
  createOnboardingUser,
  createL,
  follow,
  accessCookie,
  expiredAccessCookie,
  forgedAccessCookie,
  issueRefreshSession,
  hashRefresh,
  signJwt,
  ACCESS_SECRET,
  REFRESH_SECRET,
  WEB_URL,
  R2_PUBLIC_BASE_URL: R2_PUBLIC_BASE_URL(),
};
