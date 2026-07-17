'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const dbPublicApi = require('@linkedout/db');

test('the DB runtime API cannot bypass the ULID-extended client factory', () => {
  assert.equal(typeof dbPublicApi.createPrismaClient, 'function');
  assert.equal(
    Object.hasOwn(dbPublicApi, 'PrismaClient'),
    false,
    'raw PrismaClient must remain type-only at the package boundary',
  );
  assert.equal(dbPublicApi.modelUsesUlid('RateLimitBucket'), false);
  assert.equal(dbPublicApi.modelUsesUlid('DailyLSelection'), false);
  assert.equal(dbPublicApi.modelUsesUlid('User'), true);
});

// The extension only sees top-level writes, so a nested relation create would keep the
// schema's `@default(cuid())`. That is not a cosmetic id difference: `'0' < 'c'`, so the cuid
// row outranks every ULID forever in the id-keyset lists the whole API paginates on. The
// extension refuses the write instead; this pins that it refuses rather than quietly allows.
// No connection is needed — the extension throws before the query is dispatched.
test('a nested relation create is refused instead of silently taking a cuid', async () => {
  const db = dbPublicApi.createPrismaClient({
    datasourceUrl: 'postgresql://unused:unused@127.0.0.1:1/unused',
  });
  try {
    await assert.rejects(
      db.l.create({
        data: {
          title: 'Nested write',
          story: 'A story',
          authorId: 'someone',
          comments: { create: { body: 'child', authorId: 'someone' } },
        },
      }),
      /nested "create" write/,
      'a nested create must be refused, not given a cuid',
    );

    // The equivalent top-level create is untouched by the guard — it fails only on the unusable
    // datasource. (That it receives a ULID is proven end-to-end by the integration suite's ULID
    // invariants, against a real database.)
    await assert.rejects(
      db.l.create({ data: { title: 'Top level', story: 'A story', authorId: 'someone' } }),
      (error) => !/nested/.test(error.message),
      'a top-level create must not trip the nested-write guard',
    );
  } finally {
    await db.$disconnect();
  }
});

test('the deterministic seed wipe includes every standalone lifecycle table', () => {
  const seed = readFileSync(
    resolve(__dirname, '../../../../packages/db/prisma/seed.cjs'),
    'utf8',
  );

  for (const delegate of [
    'verificationToken',
    'rateLimitBucket',
    'avatarDeletionClaim',
    'dailyLSelection',
  ]) {
    assert.match(seed, new RegExp(`tx\\.${delegate}\\.deleteMany\\(\\)`));
  }
});
