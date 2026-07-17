const assert = require('node:assert/strict');
const { beforeEach, describe, test } = require('node:test');

const {
  BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS,
  BROWSER_SESSION_IDLE_TIMEOUT_MS,
  BrowserSessionAuthority,
  hashBrowserSessionCookie,
} = require('@linkedout/session-authority');
const h = require('../_harness.cjs');

const START = new Date('2026-01-01T00:00:00.000Z');
const VALID_BUT_UNKNOWN_COOKIE = 'A'.repeat(43);

function clockAt(initial) {
  let current = initial;
  return {
    clock: { now: () => current },
    set: (next) => {
      current = next;
    },
  };
}

function after(start, milliseconds) {
  return new Date(start.getTime() + milliseconds);
}

describe('browser session authority', () => {
  beforeEach(async () => {
    await h.resetDb();
  });

  test('stores only a hashed opaque cookie and preserves explicit credential states', async () => {
    const user = await h.createUser();
    const time = clockAt(START);
    const authority = new BrowserSessionAuthority(h.ctx.prisma, { clock: time.clock });

    assert.deepEqual(await authority.authorize(undefined), { kind: 'absent' });
    assert.deepEqual(await authority.authorize('not-a-session-cookie'), { kind: 'invalid' });
    assert.deepEqual(await authority.authorize(VALID_BUT_UNKNOWN_COOKIE), { kind: 'invalid' });

    const created = await authority.create(user.id);
    assert.match(created.cookie, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(created.sid, created.cookie);
    const stored = await h.ctx.prisma.browserSession.findUniqueOrThrow({
      where: { id: created.sid },
    });
    assert.equal(stored.cookieHash, hashBrowserSessionCookie(created.cookie));
    assert.notEqual(stored.cookieHash, created.cookie);
    assert.equal(stored.sub, user.id);

    const authorized = await authority.authorize(created.cookie);
    assert.equal(authorized.kind, 'authenticated');
    assert.equal(authorized.session.sid, created.sid);
    assert.equal(authorized.session.sub, user.id);

    time.set(after(START, BROWSER_SESSION_IDLE_TIMEOUT_MS));
    assert.deepEqual(await authority.authorize(created.cookie), { kind: 'expired' });
  });

  test('slides monotonically under concurrent requests and enforces the 90-day cap', async () => {
    const user = await h.createUser();
    const creationTime = clockAt(START);
    const creator = new BrowserSessionAuthority(h.ctx.prisma, { clock: creationTime.clock });
    const created = await creator.create(user.id);
    const older = after(START, 24 * 60 * 60 * 1000);
    const newer = after(START, 2 * 24 * 60 * 60 * 1000);
    const authorities = Array.from({ length: 20 }, (_, index) =>
      new BrowserSessionAuthority(h.ctx.prisma, {
        clock: { now: () => (index % 2 === 0 ? newer : older) },
      }),
    );

    const outcomes = await Promise.all(
      authorities.map((authority) => authority.authorize(created.cookie)),
    );
    assert.ok(outcomes.every(({ kind }) => kind === 'authenticated'));
    const stored = await h.ctx.prisma.browserSession.findUniqueOrThrow({
      where: { id: created.sid },
    });
    assert.equal(stored.lastUsedAt.toISOString(), newer.toISOString());

    const longLivedTime = clockAt(START);
    const longLivedAuthority = new BrowserSessionAuthority(h.ctx.prisma, {
      clock: longLivedTime.clock,
    });
    const longLived = await longLivedAuthority.create(user.id);
    for (const days of [29, 58, 87]) {
      longLivedTime.set(after(START, days * 24 * 60 * 60 * 1000));
      assert.equal((await longLivedAuthority.authorize(longLived.cookie)).kind, 'authenticated');
    }
    longLivedTime.set(after(START, BROWSER_SESSION_ABSOLUTE_TIMEOUT_MS));
    assert.deepEqual(await longLivedAuthority.authorize(longLived.cookie), { kind: 'expired' });
  });

  test('revokes tombstone-first, is idempotent, and never turns store failure into absence', async () => {
    const user = await h.createUser();
    const authority = new BrowserSessionAuthority(h.ctx.prisma, {
      clock: { now: () => START },
    });
    const created = await authority.create(user.id);

    assert.deepEqual(await authority.revoke(created.cookie), { revoked: true });
    const tombstone = await h.ctx.prisma.browserSession.findUniqueOrThrow({
      where: { id: created.sid },
    });
    assert.equal(tombstone.revokedAt.toISOString(), START.toISOString());
    assert.deepEqual(await authority.authorize(created.cookie), { kind: 'revoked' });
    assert.deepEqual(await authority.revoke(created.cookie), { revoked: false });
    assert.deepEqual(await authority.revoke(undefined), { revoked: false });

    const infrastructureFailure = new Error('session store unavailable');
    const unavailable = new BrowserSessionAuthority({
      async $queryRaw() {
        throw infrastructureFailure;
      },
    });
    await assert.rejects(() => unavailable.authorize(VALID_BUT_UNKNOWN_COOKIE), infrastructureFailure);
  });
});
