'use strict';

const assert = require('node:assert/strict');
const { describe, test, beforeEach } = require('node:test');

const h = require('../_harness.cjs');

/** Mirrors rate-limit.interceptor.ts — reads 120/min, writes 30/min, per identity. */
const WRITE_LIMIT = 30;
const READ_LIMIT = 120;

describe('19 · rate limiting (contract §1.8)', () => {
  let user;

  beforeEach(async () => {
    await h.resetDb();
    user = await h.createUser({ username: 'limited' });
  });

  test('writes are capped at 30/min per user, then 429 RATE_LIMITED with Retry-After', async () => {
    const l = await h.createL(user.id);

    let limited = null;
    for (let i = 0; i < WRITE_LIMIT + 2; i += 1) {
      const res = await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
      if (res.status === 429) {
        limited = res;
        assert.ok(i >= WRITE_LIMIT, `limited too early, on request ${i + 1}`);
        break;
      }
      assert.equal(res.status, 200, `request ${i + 1} should succeed`);
    }

    assert.ok(limited, `expected a 429 within ${WRITE_LIMIT + 2} writes`);
    h.expectError(limited, 429, 'RATE_LIMITED');

    const retryAfter = limited.headers.get('retry-after');
    assert.ok(retryAfter, 'a 429 must carry Retry-After (contract §1.8)');
    const seconds = Number(retryAfter);
    assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 60, `bad Retry-After: ${retryAfter}`);
  });

  test('reads are capped at 120/min per user', async () => {
    let limited = null;
    for (let i = 0; i < READ_LIMIT + 2; i += 1) {
      const res = await h.get('/notifications/unread-count', { cookie: user.cookie });
      if (res.status === 429) {
        limited = res;
        assert.ok(i >= READ_LIMIT, `read limited too early, on request ${i + 1}`);
        break;
      }
    }
    assert.ok(limited, `expected a 429 within ${READ_LIMIT + 2} reads`);
    h.expectError(limited, 429, 'RATE_LIMITED');
  });

  test('read and write budgets are independent buckets', async () => {
    const l = await h.createL(user.id);
    for (let i = 0; i < WRITE_LIMIT + 1; i += 1) {
      await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
    }
    const write = await h.put(`/ls/${l.id}/reactions/PAIN`, { cookie: user.cookie });
    assert.equal(write.status, 429, 'the write bucket is exhausted');

    const read = await h.get('/feed', { cookie: user.cookie });
    assert.equal(read.status, 200, 'reads must still flow after writes are throttled');
  });

  test('one user’s budget never throttles another', async () => {
    const other = await h.createUser({ username: 'other' });
    const l = await h.createL(user.id);

    for (let i = 0; i < WRITE_LIMIT + 1; i += 1) {
      await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
    }
    assert.equal(
      (await h.put(`/ls/${l.id}/reactions/PAIN`, { cookie: user.cookie })).status,
      429,
    );

    const theirs = await h.put(`/ls/${l.id}/reactions/RESPECT`, { cookie: other.cookie });
    assert.equal(theirs.status, 200, 'buckets are keyed per user');
  });

  test('the limiter never throttles a request into an unshaped error', async () => {
    const l = await h.createL(user.id);
    for (let i = 0; i < WRITE_LIMIT + 2; i += 1) {
      const res = await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
      if (res.status === 429) {
        assert.ok(res.body.error, 'a throttled response still uses the error envelope');
        assert.equal(res.body.error.code, 'RATE_LIMITED');
        return;
      }
    }
    assert.fail('never hit the limit');
  });

  test('the bucket resets once its window expires', async () => {
    const l = await h.createL(user.id);
    for (let i = 0; i < WRITE_LIMIT + 1; i += 1) {
      await h.put(`/ls/${l.id}/reactions/HELPFUL`, { cookie: user.cookie });
    }
    assert.equal((await h.put(`/ls/${l.id}/reactions/PAIN`, { cookie: user.cookie })).status, 429);

    // Expire the window in place rather than sleeping 60s.
    await h.ctx.prisma.rateLimitBucket.updateMany({
      where: { key: `write:user:${user.id}` },
      data: { resetAt: new Date(Date.now() - 1000) },
    });

    const after = await h.put(`/ls/${l.id}/reactions/PAIN`, { cookie: user.cookie });
    assert.equal(after.status, 200, 'a fresh window restores the budget');
  });
});
