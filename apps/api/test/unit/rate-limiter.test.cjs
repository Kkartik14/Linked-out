'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { setImmediate: waitForImmediate } = require('node:timers/promises');

require('reflect-metadata');

const { Reflector } = require('@nestjs/core');

const {
  RateLimiter,
} = require('../../dist/common/rate-limit/rate-limiter');
const {
  RateLimitInterceptor,
} = require('../../dist/common/interceptors/rate-limit.interceptor');
const {
  MetaController,
} = require('../../dist/modules/meta/meta.controller');
const {
  PRODUCTION_RATE_LIMITER_OPTIONS,
} = require('../../dist/common/rate-limit/rate-limit.module');

const SKIP_RATE_LIMIT_METADATA = Symbol.for('linkedout:skip-rate-limit');

/**
 * Test adapter for the lease-store seam. Reservations are synchronous before
 * yielding, which gives the same atomic contract as the PostgreSQL adapter.
 */
class SharedLeaseStore {
  buckets = new Map();
  reservationCount = 0;
  requestedPermits = [];

  async reservePermits({ key, limit, permits, windowMs, nowMs }) {
    this.reservationCount += 1;
    this.requestedPermits.push(permits);
    const existing = this.buckets.get(key);
    const bucket = !existing || existing.resetAt <= nowMs
      ? { count: 0, resetAt: nowMs + windowMs }
      : existing;
    const granted = Math.min(permits, Math.max(0, limit - bucket.count));
    bucket.count += granted;
    this.buckets.set(key, bucket);
    return {
      granted,
      resetAt: bucket.resetAt,
      exhausted: bucket.count >= limit,
    };
  }
}

async function takeMany(limiter, amount, input) {
  return Promise.all(Array.from({ length: amount }, () => limiter.take(input)));
}

test('a hot bucket grants exactly its global limit and returns a stable Retry-After', async () => {
  const store = new SharedLeaseStore();
  const limiter = new RateLimiter(store);
  const input = { key: 'write:user:one', limit: 30, windowMs: 60_000, nowMs: 1_000 };

  const results = await takeMany(limiter, 31, input);

  assert.equal(results.filter((result) => result.allowed).length, 30);
  assert.deepEqual(
    results.find((result) => !result.allowed),
    { allowed: false, retryAfterSeconds: 60 },
  );
  assert.ok(store.reservationCount <= 12, 'hot traffic must not reserve once per request');
  assert.ok(Math.max(...store.requestedPermits) <= 3, 'a 30/minute bucket leases at most 10%');
  assert.ok(
    store.requestedPermits.some((permits, index) => index > 0 && permits > store.requestedPermits[index - 1]),
    'lease size grows after successful refills',
  );
  assert.deepEqual(
    await limiter.take({ ...input, nowMs: 61_000 }),
    { allowed: true },
    'the first request at the next window starts a fresh budget',
  );
});

test('separate limiter instances can never lease more than the shared global budget', async () => {
  const store = new SharedLeaseStore();
  const first = new RateLimiter(store);
  const second = new RateLimiter(store);
  const input = { key: 'read:ip:127.0.0.1', limit: 12, windowMs: 60_000, nowMs: 5_000 };

  const results = await Promise.all([
    ...Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? first : second).take(input)),
    first.take(input),
    second.take(input),
  ]);

  assert.equal(results.filter((result) => result.allowed).length, 12);
  assert.equal(results.filter((result) => !result.allowed).length, 2);
});

test('an exhausted local bucket updates Retry-After without another reservation', async () => {
  const store = new SharedLeaseStore();
  const limiter = new RateLimiter(store);
  const input = { key: 'write:user:two', limit: 1, windowMs: 60_000, nowMs: 10_000 };

  assert.deepEqual(await limiter.take(input), { allowed: true });
  assert.deepEqual(await limiter.take(input), { allowed: false, retryAfterSeconds: 60 });
  assert.deepEqual(
    await limiter.take({ ...input, nowMs: 69_001 }),
    { allowed: false, retryAfterSeconds: 1 },
  );
});

test('an operational probe remains callable when the persisted limiter is unavailable', async () => {
  const outage = new Error('rate-limit database unavailable');
  const limiter = new RateLimiter({
    async reservePermits() {
      throw outage;
    },
  });
  const interceptor = new RateLimitInterceptor(limiter, new Reflector());
  const probeHandler = () => undefined;
  Reflect.defineMetadata(SKIP_RATE_LIMIT_METADATA, true, probeHandler);
  const request = { method: 'GET', headers: {}, socket: {}, ip: '127.0.0.1' };
  const response = { setHeader() {} };
  const context = {
    getType: () => 'http',
    getHandler: () => probeHandler,
    getClass: () => class ProbeController {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  };
  const next = { handle: () => 'probe-response' };

  assert.equal(await interceptor.intercept(context, next), 'probe-response');
});

test('every operational health handler is explicitly independent of the persisted limiter', () => {
  for (const method of ['privateApiHealth', 'databaseHealth', 'sessionAuthorityHealth']) {
    assert.equal(Reflect.getMetadata(SKIP_RATE_LIMIT_METADATA, MetaController.prototype[method]), true);
  }
  assert.equal(Reflect.getMetadata(SKIP_RATE_LIMIT_METADATA, MetaController.prototype.enums), undefined);
  assert.equal(Reflect.getMetadata(SKIP_RATE_LIMIT_METADATA, MetaController.prototype.openApi), undefined);
});

test('local lease cardinality fails closed and recovers after the active window', async () => {
  const store = new SharedLeaseStore();
  const limiter = new RateLimiter(store, { maxLocalKeys: 2 });
  const request = (key, nowMs) => ({ key, limit: 10, windowMs: 60_000, nowMs });

  assert.deepEqual(await limiter.take(request('read:ip:one', 1_000)), { allowed: true });
  assert.deepEqual(await limiter.take(request('read:ip:two', 1_000)), { allowed: true });
  assert.deepEqual(await limiter.take(request('read:ip:three', 1_000)), {
    allowed: false,
    retryAfterSeconds: 60,
  });
  assert.equal(store.reservationCount, 2, 'overflow identities must not start persisted refills');

  assert.deepEqual(await limiter.take(request('read:ip:three', 61_000)), { allowed: true });
  assert.equal(store.reservationCount, 3, 'expired local keys release capacity');
});

test('concurrent identity floods cannot create more in-flight refills than the local cap', async () => {
  const store = new SharedLeaseStore();
  const originalReserve = store.reservePermits.bind(store);
  store.reservePermits = async (request) => {
    await waitForImmediate();
    return originalReserve(request);
  };
  const limiter = new RateLimiter(store, { maxLocalKeys: 3 });
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      limiter.take({
        key: `read:ip:${index}`,
        limit: 10,
        windowMs: 60_000,
        nowMs: 1_000,
      }),
    ),
  );

  assert.equal(results.filter(({ allowed }) => allowed).length, 3);
  assert.equal(store.reservationCount, 3);
});

test('hot overflow rejection does not scan every tracked identity', async () => {
  const store = new SharedLeaseStore();
  const limiter = new RateLimiter(store, { maxLocalKeys: 2 });
  const request = (key) => ({ key, limit: 10, windowMs: 60_000, nowMs: 1_000 });
  await limiter.take(request('read:ip:one'));
  await limiter.take(request('read:ip:two'));

  limiter.leases[Symbol.iterator] = () => {
    throw new Error('hot overflow must not walk the lease map');
  };
  limiter.leases.values = () => {
    throw new Error('hot overflow must not scan lease expiries');
  };

  assert.deepEqual(await limiter.take(request('read:ip:overflow')), {
    allowed: false,
    retryAfterSeconds: 60,
  });
});

test('untrusted identities cannot consume capacity reserved for fixed internal BFF buckets', async () => {
  const store = new SharedLeaseStore();
  const limiter = new RateLimiter(store, {
    maxLocalKeys: 4,
    reservedLocalKeys: 1,
    reservedKeyPrefixes: ['internal:bff:'],
  });
  const take = (key) => limiter.take({ key, limit: 10, windowMs: 60_000, nowMs: 1_000 });

  for (const key of ['read:ip:one', 'read:ip:two', 'read:ip:three']) {
    assert.deepEqual(await take(key), { allowed: true });
  }
  assert.equal((await take('read:ip:overflow')).allowed, false);
  assert.deepEqual(await take('internal:bff:session-resolve'), { allowed: true });
  assert.equal((await take('internal:bff:auth-exchange')).allowed, false);
});

test('production reserves one local slot for every fixed internal BFF operation', async () => {
  assert.deepEqual(PRODUCTION_RATE_LIMITER_OPTIONS, {
    reservedLocalKeys: 3,
    reservedKeyPrefixes: ['internal:bff:'],
  });
  const limiter = new RateLimiter(new SharedLeaseStore(), {
    maxLocalKeys: 5,
    ...PRODUCTION_RATE_LIMITER_OPTIONS,
  });
  const take = (key) => limiter.take({ key, limit: 10, windowMs: 60_000, nowMs: 1_000 });

  assert.equal((await take('read:ip:one')).allowed, true);
  assert.equal((await take('read:ip:two')).allowed, true);
  assert.equal((await take('read:ip:overflow')).allowed, false);
  for (const operation of ['auth-exchange', 'session-resolve', 'session-revoke']) {
    assert.equal((await take(`internal:bff:${operation}`)).allowed, true, operation);
  }
  assert.equal((await take('internal:bff:unknown')).allowed, false);
});

test('Retry-After is calculated from the saturated key pool only', async () => {
  const limiter = new RateLimiter(new SharedLeaseStore(), {
    maxLocalKeys: 2,
    reservedLocalKeys: 1,
    reservedKeyPrefixes: ['internal:bff:'],
  });
  await limiter.take({
    key: 'internal:bff:session-resolve',
    limit: 10,
    windowMs: 60_000,
    nowMs: 1_000,
  });
  await limiter.take({ key: 'read:ip:one', limit: 10, windowMs: 60_000, nowMs: 59_000 });

  assert.deepEqual(
    await limiter.take({ key: 'read:ip:overflow', limit: 10, windowMs: 60_000, nowMs: 60_000 }),
    { allowed: false, retryAfterSeconds: 59 },
  );
});

test('reserved capacity and prefixes must be configured as one valid pair', () => {
  const store = new SharedLeaseStore();
  for (const options of [
    { maxLocalKeys: 2, reservedLocalKeys: 0, reservedKeyPrefixes: ['internal:'] },
    { maxLocalKeys: 2, reservedLocalKeys: 1, reservedKeyPrefixes: [] },
    { maxLocalKeys: 2, reservedLocalKeys: 1, reservedKeyPrefixes: [''] },
    { maxLocalKeys: 2, reservedLocalKeys: 1, reservedKeyPrefixes: ['internal:', 'internal:'] },
  ]) {
    assert.throws(() => new RateLimiter(store, options), /local key limits must be valid/);
  }
});
