'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

require('reflect-metadata');

const {
  AccessPrincipalResolver,
} = require('../../dist/modules/auth/access-principal.resolver');

const USER_ID = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

function claims(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: USER_ID,
    username: 'kartik',
    iat: now,
    exp: now + 900,
    ...overrides,
  };
}

test('access principal existence is resolved once per short-lived token', async () => {
  let lookups = 0;
  const resolver = new AccessPrincipalResolver({
    findAccessPrincipal: async () => {
      lookups += 1;
      return { id: USER_ID, username: 'kartik' };
    },
  });
  const token = claims();

  assert.deepEqual(await resolver.resolve(token), { id: USER_ID, username: 'kartik' });
  assert.deepEqual(await resolver.resolve(token), { id: USER_ID, username: 'kartik' });
  assert.equal(lookups, 1, 'repeated requests with one access token share its existence check');

  assert.deepEqual(
    await resolver.resolve({ ...token, iat: token.iat + 1 }),
    { id: USER_ID, username: 'kartik' },
  );
  assert.equal(lookups, 2, 'a newly-issued token gets an independent existence check');
});

test('concurrent first requests share one principal lookup', async () => {
  let lookups = 0;
  let finishLookup;
  const pending = new Promise((resolve) => {
    finishLookup = resolve;
  });
  const resolver = new AccessPrincipalResolver({
    findAccessPrincipal: async () => {
      lookups += 1;
      return pending;
    },
  });
  const token = claims();

  const first = resolver.resolve(token);
  const second = resolver.resolve(token);
  assert.equal(lookups, 1);
  finishLookup({ id: USER_ID, username: 'kartik' });

  assert.deepEqual(await Promise.all([first, second]), [
    { id: USER_ID, username: 'kartik' },
    { id: USER_ID, username: 'kartik' },
  ]);
});

test('tokens with identical times but different subjects never share a cached principal', async () => {
  const otherId = '01ARZ3NDEKTSV4RRFFQ69G5FAW';
  const lookedUp = [];
  const resolver = new AccessPrincipalResolver({
    findAccessPrincipal: async (id) => {
      lookedUp.push(id);
      return { id, username: id === USER_ID ? 'kartik' : 'other' };
    },
  });
  const first = claims();
  const second = { ...first, sub: otherId, username: 'other' };

  assert.deepEqual(await resolver.resolve(first), { id: USER_ID, username: 'kartik' });
  assert.deepEqual(await resolver.resolve(second), { id: otherId, username: 'other' });
  assert.deepEqual(lookedUp, [USER_ID, otherId]);
});

test('a deleted principal stays rejected for the remainder of that token', async () => {
  let lookups = 0;
  const resolver = new AccessPrincipalResolver({
    findAccessPrincipal: async () => {
      lookups += 1;
      return null;
    },
  });
  const token = claims();

  assert.equal(await resolver.resolve(token), null);
  assert.equal(await resolver.resolve(token), null);
  assert.equal(lookups, 1);
});

test('infrastructure failures surface and are never cached as a deleted principal', async () => {
  let lookups = 0;
  const resolver = new AccessPrincipalResolver({
    findAccessPrincipal: async () => {
      lookups += 1;
      if (lookups === 1) throw new Error('database unavailable');
      return { id: USER_ID, username: 'kartik' };
    },
  });
  const token = claims();

  await assert.rejects(() => resolver.resolve(token), /database unavailable/);
  assert.deepEqual(await resolver.resolve(token), { id: USER_ID, username: 'kartik' });
  assert.equal(lookups, 2);
});
