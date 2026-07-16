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
