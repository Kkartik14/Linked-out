const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  CleanupJob,
  DEFAULT_CLEANUP_OPTIONS,
} = require('../../dist/maintenance/cleanup.job');
const { R2AvatarObjectStore } = require('../../dist/maintenance/r2-avatar-object.store');
const { parseCleanupArgs } = require('../../dist/maintenance/run-cleanup');

const NOW = new Date('2026-07-13T12:00:00.000Z');

function persistenceWithBatches(batches = {}) {
  const calls = [];
  const references = [];
  const claims = [];
  const completed = [];
  const failed = [];
  return {
    calls,
    references,
    claims,
    completed,
    failed,
    async auditAvatarIdentity() {
      return { drifted: 0, samples: [], samplesTruncated: false };
    },
    async deleteExpiredBatch(entity, cutoff, limit) {
      calls.push({ entity, cutoff, limit });
      return batches[entity]?.shift() ?? 0;
    },
    async findReferencedAvatarKeys(keys) {
      references.push([...keys]);
      return new Set(keys.filter((key) => key.endsWith('/active.jpg')));
    },
    async claimUnreferencedAvatarKeys(keys) {
      claims.push([...keys]);
      return {
        referenced: new Set(keys.filter((key) => key.endsWith('/active.jpg'))),
        claimed: new Set(keys.filter((key) => !key.endsWith('/active.jpg'))),
      };
    },
    async markAvatarDeletionSucceeded(keys) {
      completed.push([...keys]);
    },
    async markAvatarDeletionFailed(keys) {
      failed.push([...keys]);
    },
  };
}

test('cleanup job removes expired database rows in bounded, repeatable batches', async () => {
  const persistence = persistenceWithBatches({
    sessions: [2, 1],
    browserSessions: [2, 0],
    oauthHandoffs: [2, 1],
    verificationTokens: [2, 0],
    rateLimitBuckets: [0],
  });
  const job = new CleanupJob(persistence);

  const result = await job.run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    dbBatchSize: 2,
    maxDbRowsPerEntity: 10,
    avatarMode: 'skip',
  });

  assert.deepEqual(result.database, {
    sessions: { deleted: 3, limitReached: false },
    browserSessions: { deleted: 2, limitReached: false },
    oauthHandoffs: { deleted: 3, limitReached: false },
    verificationTokens: { deleted: 2, limitReached: false },
    rateLimitBuckets: { deleted: 0, limitReached: false },
  });
  assert.deepEqual(
    persistence.calls.map(({ entity, limit }) => ({ entity, limit })),
    [
      { entity: 'sessions', limit: 2 },
      { entity: 'sessions', limit: 2 },
      { entity: 'browserSessions', limit: 2 },
      { entity: 'browserSessions', limit: 2 },
      { entity: 'oauthHandoffs', limit: 2 },
      { entity: 'oauthHandoffs', limit: 2 },
      { entity: 'verificationTokens', limit: 2 },
      { entity: 'verificationTokens', limit: 2 },
      { entity: 'rateLimitBuckets', limit: 2 },
    ],
  );
  assert.ok(persistence.calls.every(({ cutoff }) => cutoff.getTime() === NOW.getTime()));
});

test('avatar cleanup is dry-run by default, paginates, and skips unsafe or young objects', async () => {
  const old = new Date(NOW.getTime() - 49 * 60 * 60 * 1000);
  const fresh = new Date(NOW.getTime() - 60 * 60 * 1000);
  const persistence = persistenceWithBatches();
  const deleted = [];
  const listed = [];
  const objectStore = {
    async listAvatarObjects(continuationToken, pageSize) {
      listed.push({ continuationToken, pageSize });
      if (!continuationToken) {
        return {
          objects: [
            { key: 'secrets/do-not-touch.jpg', lastModified: old },
            { key: 'avatars/user-1/fresh.jpg', lastModified: fresh },
            { key: 'avatars/user-1/active.jpg', lastModified: old },
            { key: 'avatars/user-1/orphan.jpg', lastModified: old },
            { key: 'avatars/user-1/no-timestamp.jpg' },
          ],
          nextContinuationToken: 'page-2',
        };
      }
      return {
        objects: [{ key: 'avatars/user-2/another-orphan.jpg', lastModified: old }],
      };
    },
    async deleteAvatarObjects(keys) {
      deleted.push(...keys);
    },
  };
  const job = new CleanupJob(persistence, objectStore);

  const result = await job.run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    dbBatchSize: 2,
    maxDbRowsPerEntity: 2,
    avatarPageSize: 20,
  });

  assert.deepEqual(listed, [
    { continuationToken: undefined, pageSize: 20 },
    { continuationToken: 'page-2', pageSize: 20 },
  ]);
  assert.deepEqual(deleted, []);
  assert.deepEqual(result.avatars, {
    mode: 'dry-run',
    scanned: 6,
    orphaned: 2,
    deleted: 0,
    referenced: 1,
    skippedRecent: 1,
    skippedUnsafe: 1,
    skippedMissingTimestamp: 1,
    orphanSamples: [
      'avatars/user-1/orphan.jpg',
      'avatars/user-2/another-orphan.jpg',
    ],
    orphanSamplesTruncated: false,
    identityDrifted: 0,
    identityDriftSamples: [],
    identityDriftSamplesTruncated: false,
    limitReached: false,
    nextStartAfter: null,
  });
  assert.deepEqual(persistence.references.flat(), [
    'avatars/user-1/active.jpg',
    'avatars/user-1/orphan.jpg',
    'avatars/user-2/another-orphan.jpg',
  ]);
});

test('avatar apply refuses identity drift before any database or object-store mutation', async () => {
  const persistence = persistenceWithBatches();
  persistence.auditAvatarIdentity = async () => ({
    drifted: 1,
    samples: ['avatars/user-1/legacy.jpg'],
    samplesTruncated: false,
  });
  let listed = false;
  const objectStore = {
    async listAvatarObjects() {
      listed = true;
      return { objects: [] };
    },
    async deleteAvatarObjects() {},
  };

  await assert.rejects(
    () => new CleanupJob(persistence, objectStore).run({
      ...DEFAULT_CLEANUP_OPTIONS,
      now: NOW,
      avatarMode: 'apply',
    }),
    /avatar identity drift/i,
  );
  assert.deepEqual(persistence.calls, [], 'expired-row deletion must not run before preflight');
  assert.equal(listed, false, 'R2 listing/deletion must not run before preflight');
});

test('avatar scan returns a stable resume cursor so a capped undeletable prefix cannot starve later keys', async () => {
  const old = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
  const persistence = persistenceWithBatches();
  const listed = [];
  const objectStore = {
    async listAvatarObjects(token, pageSize, startAfter) {
      listed.push({ token, pageSize, startAfter });
      if (startAfter) {
        return {
          objects: [{ key: 'avatars/user-2/orphan.jpg', lastModified: old }],
        };
      }
      return {
        objects: [
          { key: 'avatars/user-1/active.jpg', lastModified: old },
          { key: 'avatars/user-1/fresh.jpg', lastModified: NOW },
        ],
        nextContinuationToken: 'more',
      };
    },
    async deleteAvatarObjects() {},
  };

  const result = await new CleanupJob(persistence, objectStore).run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    avatarMode: 'dry-run',
    avatarPageSize: 500,
    maxAvatarObjects: 2,
  });

  assert.deepEqual(listed, [{ token: undefined, pageSize: 2, startAfter: undefined }]);
  assert.equal(result.avatars.scanned, 2);
  assert.equal(result.avatars.limitReached, true);
  assert.equal(result.avatars.nextStartAfter, 'avatars/user-1/fresh.jpg');

  const resumed = await new CleanupJob(persistence, objectStore).run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    avatarMode: 'dry-run',
    maxAvatarObjects: 2,
    avatarStartAfter: result.avatars.nextStartAfter,
  });
  assert.equal(resumed.avatars.orphaned, 1, 'second run must reach the later orphan');
  assert.equal(resumed.avatars.nextStartAfter, null);
  assert.deepEqual(listed[1], {
    token: undefined,
    pageSize: 2,
    startAfter: 'avatars/user-1/fresh.jpg',
  });
});

test('avatar apply mode deletes only old, unreferenced avatars and rejects broken pagination', async () => {
  const old = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
  const persistence = persistenceWithBatches();
  const deleted = [];
  const objectStore = {
    async listAvatarObjects() {
      return {
        objects: [
          { key: '../outside.jpg', lastModified: old },
          { key: 'avatars/user-1/active.jpg', lastModified: old },
          { key: 'avatars/user-1/orphan.jpg', lastModified: old },
        ],
      };
    },
    async deleteAvatarObjects(keys) {
      deleted.push(...keys);
    },
  };
  const job = new CleanupJob(persistence, objectStore);

  const result = await job.run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    dbBatchSize: 1,
    maxDbRowsPerEntity: 1,
    avatarMode: 'apply',
  });

  assert.deepEqual(deleted, ['avatars/user-1/orphan.jpg']);
  assert.equal(result.avatars.deleted, 1);
  assert.deepEqual(persistence.completed, [['avatars/user-1/orphan.jpg']]);

  const loopingStore = {
    async listAvatarObjects() {
      return { objects: [], nextContinuationToken: 'same-token' };
    },
    async deleteAvatarObjects() {},
  };
  await assert.rejects(
    () => new CleanupJob(persistence, loopingStore).run({
      ...DEFAULT_CLEANUP_OPTIONS,
      now: NOW,
      avatarMode: 'dry-run',
    }),
    /repeated continuation token/i,
  );
});

test('avatar apply atomically claims keys so a profile reference won in the check/delete gap', async () => {
  const old = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
  const deleted = [];
  const persistence = persistenceWithBatches();
  persistence.claimUnreferencedAvatarKeys = async (keys) => ({
    // Simulate a concurrent profile update that commits after listing but before
    // the durable claim transaction acquires the key lock.
    referenced: new Set(['avatars/user-1/became-active.jpg']),
    claimed: new Set(keys.filter((key) => key.endsWith('/orphan.jpg'))),
  });
  const objectStore = {
    async listAvatarObjects() {
      return {
        objects: [
          { key: 'avatars/user-1/became-active.jpg', lastModified: old },
          { key: 'avatars/user-1/orphan.jpg', lastModified: old },
        ],
      };
    },
    async deleteAvatarObjects(keys) {
      deleted.push(...keys);
    },
  };

  const result = await new CleanupJob(persistence, objectStore).run({
    ...DEFAULT_CLEANUP_OPTIONS,
    now: NOW,
    avatarMode: 'apply',
  });

  assert.deepEqual(deleted, ['avatars/user-1/orphan.jpg']);
  assert.equal(result.avatars.referenced, 1);
  assert.equal(result.avatars.orphaned, 1);
});

test('a failed asset delete leaves its durable claim retryable and reports failure', async () => {
  const old = new Date(NOW.getTime() - 72 * 60 * 60 * 1000);
  const persistence = persistenceWithBatches();
  const objectStore = {
    async listAvatarObjects() {
      return { objects: [{ key: 'avatars/user-1/orphan.jpg', lastModified: old }] };
    },
    async deleteAvatarObjects() {
      throw new Error('object store unavailable');
    },
  };

  await assert.rejects(
    () => new CleanupJob(persistence, objectStore).run({
      ...DEFAULT_CLEANUP_OPTIONS,
      now: NOW,
      avatarMode: 'apply',
    }),
    /object store unavailable/,
  );
  assert.deepEqual(persistence.failed, [['avatars/user-1/orphan.jpg']]);
  assert.deepEqual(persistence.completed, []);
});

test('cleanup CLI parses safe defaults and rejects ambiguous flags', () => {
  const defaults = parseCleanupArgs([]);
  assert.equal(defaults.avatarMode, 'dry-run');
  assert.equal(defaults.avatarGracePeriodMs, 48 * 60 * 60 * 1000);
  assert.equal(defaults.maxAvatarObjects, 100_000);

  const apply = parseCleanupArgs([
    '--apply-assets',
    '--db-batch-size=250',
    '--max-db-rows=5000',
    '--asset-grace-hours=72',
    '--asset-page-size=100',
    '--max-asset-objects=2500',
  ]);
  assert.equal(apply.avatarMode, 'apply');
  assert.equal(apply.dbBatchSize, 250);
  assert.equal(apply.maxDbRowsPerEntity, 5000);
  assert.equal(apply.avatarGracePeriodMs, 72 * 60 * 60 * 1000);
  assert.equal(apply.avatarPageSize, 100);
  assert.equal(apply.maxAvatarObjects, 2500);

  const resumed = parseCleanupArgs(['--asset-start-after=avatars/user-1/avatar.jpg']);
  assert.equal(resumed.avatarStartAfter, 'avatars/user-1/avatar.jpg');

  assert.throws(() => parseCleanupArgs(['--apply-assets', '--skip-assets']), /cannot be combined/i);
  assert.throws(() => parseCleanupArgs(['--asset-page-size=1001']), /between 1 and 1000/i);
  assert.throws(() => parseCleanupArgs(['--surprise']), /unknown cleanup option/i);
});

test('cleanup CLI loads the working directory .env before validating configuration', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'linkedout-cleanup-env-'));
  const envFile = [
    'NODE_ENV=test',
    'API_BASE_URL=http://localhost:4000',
    'WEB_URL=http://localhost:3000',
    'DATABASE_URL=postgresql://example:example@localhost:5432/example',
    'JWT_ACCESS_SECRET=test-access-secret-0123456789',
    'JWT_REFRESH_SECRET=test-refresh-secret-0123456789',
  ].join('\n');
  fs.writeFileSync(path.join(directory, '.env'), `${envFile}\n`);

  const cleanupModule = path.resolve(__dirname, '../../dist/maintenance/run-cleanup.js');
  const configModule = path.resolve(__dirname, '../../dist/config/app-config.service.js');
  const probe = [
    `require(${JSON.stringify(cleanupModule)});`,
    `const { AppConfigService } = require(${JSON.stringify(configModule)});`,
    'const config = new AppConfigService();',
    "process.stdout.write(config.apiBaseUrl);",
  ].join('');
  const child = spawnSync(process.execPath, ['-e', probe], {
    cwd: directory,
    encoding: 'utf8',
    env: { PATH: process.env.PATH },
  });

  fs.rmSync(directory, { recursive: true, force: true });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout, 'http://localhost:4000');
});

test('R2 adapter pins listings and every delete to the avatars namespace', async () => {
  const commands = [];
  const client = {
    async send(command) {
      commands.push(command);
      if (command.constructor.name === 'ListObjectsV2Command') {
        return {
          Contents: [{ Key: 'avatars/user-1/avatar.jpg', LastModified: NOW }],
          IsTruncated: true,
          NextContinuationToken: 'next',
        };
      }
      return { Errors: [] };
    },
  };
  const store = new R2AvatarObjectStore(client, 'avatars-bucket');

  const page = await store.listAvatarObjects(undefined, 50, 'avatars/user-0/previous.jpg');
  assert.equal(commands[0].input.Prefix, 'avatars/');
  assert.equal(commands[0].input.MaxKeys, 50);
  assert.equal(commands[0].input.StartAfter, 'avatars/user-0/previous.jpg');
  assert.equal(page.nextContinuationToken, 'next');

  await assert.rejects(
    () => store.deleteAvatarObjects(['private/backups/data.json']),
    /outside the avatars\//i,
  );
  assert.equal(commands.length, 1, 'unsafe keys must be rejected before an R2 request');

  await store.deleteAvatarObjects(['avatars/user-1/avatar.jpg']);
  assert.deepEqual(commands[1].input.Delete.Objects, [{ Key: 'avatars/user-1/avatar.jpg' }]);
});
