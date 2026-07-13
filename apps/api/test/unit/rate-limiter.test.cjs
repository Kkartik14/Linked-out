'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const {
  RateLimiter,
} = require('../../dist/common/rate-limit/rate-limiter');

/**
 * Test adapter for the lease-store seam. Reservations are synchronous before
 * yielding, which gives the same atomic contract as the PostgreSQL adapter.
 */
class SharedLeaseStore {
  buckets = new Map();
  reservationCount = 0;

  async reservePermits({ key, limit, permits, windowMs, nowMs }) {
    this.reservationCount += 1;
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
