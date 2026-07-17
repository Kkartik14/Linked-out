import { isAvatarListingCursor, isSafeAvatarKey } from '../common/avatar/avatar-object';

export {
  AVATAR_PREFIX,
  isAvatarListingCursor,
  isSafeAvatarKey,
} from '../common/avatar/avatar-object';
const ORPHAN_SAMPLE_LIMIT = 100;
const IDENTITY_DRIFT_SAMPLE_LIMIT = 100;

export type ExpiredEntity =
  | 'sessions'
  | 'browserSessions'
  | 'oauthHandoffs'
  | 'verificationTokens'
  | 'rateLimitBuckets';
export type AvatarCleanupMode = 'dry-run' | 'apply' | 'skip';

export interface CleanupPersistence {
  /** Delete no more than `limit` rows whose expiry is at or before `cutoff`. */
  deleteExpiredBatch(entity: ExpiredEntity, cutoff: Date, limit: number): Promise<number>;
  /** Return stable object keys currently attached to a User row. */
  findReferencedAvatarKeys(keys: readonly string[]): Promise<ReadonlySet<string>>;
  /** Atomically key-lock, reference-check, and durably claim every unreferenced key. */
  claimUnreferencedAvatarKeys(keys: readonly string[]): Promise<AvatarClaimResult>;
  markAvatarDeletionSucceeded(keys: readonly string[], deletedAt: Date): Promise<void>;
  markAvatarDeletionFailed(keys: readonly string[], error: string): Promise<void>;
  /** Read-only rolling-deploy/legacy consistency preflight. */
  auditAvatarIdentity(sampleLimit: number): Promise<AvatarIdentityAudit>;
}

export interface AvatarClaimResult {
  referenced: ReadonlySet<string>;
  claimed: ReadonlySet<string>;
}

export interface AvatarIdentityAudit {
  drifted: number;
  samples: readonly string[];
  samplesTruncated: boolean;
}

export interface AvatarObject {
  key: string;
  lastModified?: Date;
}

export interface AvatarObjectPage {
  objects: readonly AvatarObject[];
  nextContinuationToken?: string;
}

export interface AvatarObjectStore {
  listAvatarObjects(
    continuationToken: string | undefined,
    pageSize: number,
    startAfter?: string,
  ): Promise<AvatarObjectPage>;
  deleteAvatarObjects(keys: readonly string[]): Promise<void>;
}

export const DEFAULT_CLEANUP_OPTIONS = {
  dbBatchSize: 500,
  maxDbRowsPerEntity: 100_000,
  avatarMode: 'dry-run' as AvatarCleanupMode,
  avatarGracePeriodMs: 48 * 60 * 60 * 1000,
  avatarPageSize: 500,
  maxAvatarObjects: 100_000,
  avatarStartAfter: undefined as string | undefined,
};

export interface CleanupOptions {
  now: Date;
  dbBatchSize: number;
  maxDbRowsPerEntity: number;
  avatarMode: AvatarCleanupMode;
  avatarGracePeriodMs: number;
  avatarPageSize: number;
  maxAvatarObjects: number;
  avatarStartAfter?: string;
}

interface DatabaseEntityResult {
  deleted: number;
  limitReached: boolean;
}

interface AvatarCleanupResult {
  mode: AvatarCleanupMode;
  scanned: number;
  orphaned: number;
  deleted: number;
  referenced: number;
  skippedRecent: number;
  skippedUnsafe: number;
  skippedMissingTimestamp: number;
  orphanSamples: string[];
  orphanSamplesTruncated: boolean;
  identityDrifted: number;
  identityDriftSamples: string[];
  identityDriftSamplesTruncated: boolean;
  limitReached: boolean;
  nextStartAfter: string | null;
}

export interface CleanupResult {
  database: Record<ExpiredEntity, DatabaseEntityResult>;
  avatars: AvatarCleanupResult;
}

function assertPositiveInteger(name: string, value: number, max?: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || (max !== undefined && value > max)) {
    const suffix = max === undefined ? 'a positive integer' : `between 1 and ${max}`;
    throw new Error(`${name} must be ${suffix}.`);
  }
}

function emptyAvatarResult(
  mode: AvatarCleanupMode,
  audit: AvatarIdentityAudit = { drifted: 0, samples: [], samplesTruncated: false },
): AvatarCleanupResult {
  return {
    mode,
    scanned: 0,
    orphaned: 0,
    deleted: 0,
    referenced: 0,
    skippedRecent: 0,
    skippedUnsafe: 0,
    skippedMissingTimestamp: 0,
    orphanSamples: [],
    orphanSamplesTruncated: false,
    identityDrifted: audit.drifted,
    identityDriftSamples: [...audit.samples],
    identityDriftSamplesTruncated: audit.samplesTruncated,
    limitReached: false,
    nextStartAfter: null,
  };
}

/**
 * Out-of-request retention workflow. The orchestration is storage-agnostic so its
 * safety rules and batching behavior can be tested without PostgreSQL or R2.
 */
export class CleanupJob {
  constructor(
    private readonly persistence: CleanupPersistence,
    private readonly avatarStore?: AvatarObjectStore,
  ) {}

  async run(options: CleanupOptions): Promise<CleanupResult> {
    this.validateOptions(options);
    if (
      options.avatarMode !== 'skip' &&
      !this.avatarStore
    ) {
      // Preflight before database mutations so a misconfigured asset sweep does not
      // turn a nominally failed run into a partially-applied run.
      throw new Error('Avatar cleanup requires configured object storage.');
    }
    const identityAudit =
      options.avatarMode === 'skip'
        ? { drifted: 0, samples: [], samplesTruncated: false }
        : await this.persistence.auditAvatarIdentity(IDENTITY_DRIFT_SAMPLE_LIMIT);
    this.assertValidIdentityAudit(identityAudit);
    if (options.avatarMode === 'apply' && identityAudit.drifted > 0) {
      // This happens before expired-row cleanup too: an apply invocation with old-replica
      // writes or a missed legacy backfill is entirely mutation-free.
      throw new Error(
        `Avatar identity drift detected in ${identityAudit.drifted} User row(s); reconcile and drain old API replicas before apply mode.`,
      );
    }
    // Written out rather than accumulated over a list: `{} as Record<ExpiredEntity, …>` asserted
    // a totality the loop could not deliver, so adding a fourth ExpiredEntity would type-check
    // while its key held `undefined` at runtime. As a literal, a missing key is a compile error.
    const database: Record<ExpiredEntity, DatabaseEntityResult> = {
      sessions: await this.cleanupExpiredEntity('sessions', options),
      browserSessions: await this.cleanupExpiredEntity('browserSessions', options),
      oauthHandoffs: await this.cleanupExpiredEntity('oauthHandoffs', options),
      verificationTokens: await this.cleanupExpiredEntity('verificationTokens', options),
      rateLimitBuckets: await this.cleanupExpiredEntity('rateLimitBuckets', options),
    };

    const avatars =
      options.avatarMode === 'skip'
        ? emptyAvatarResult('skip')
        : await this.cleanupAvatars(options, identityAudit);
    return { database, avatars };
  }

  private validateOptions(options: CleanupOptions): void {
    if (!(options.now instanceof Date) || !Number.isFinite(options.now.getTime())) {
      throw new Error('now must be a valid Date.');
    }
    assertPositiveInteger('dbBatchSize', options.dbBatchSize);
    assertPositiveInteger('maxDbRowsPerEntity', options.maxDbRowsPerEntity);
    assertPositiveInteger('avatarPageSize', options.avatarPageSize, 1000);
    assertPositiveInteger('maxAvatarObjects', options.maxAvatarObjects);
    if (options.avatarStartAfter !== undefined && !isAvatarListingCursor(options.avatarStartAfter)) {
      throw new Error('avatarStartAfter must be an object key inside the avatars/ namespace.');
    }
    if (!Number.isSafeInteger(options.avatarGracePeriodMs) || options.avatarGracePeriodMs < 0) {
      throw new Error('avatarGracePeriodMs must be a non-negative integer.');
    }
  }

  private async cleanupExpiredEntity(
    entity: ExpiredEntity,
    options: CleanupOptions,
  ): Promise<DatabaseEntityResult> {
    let deleted = 0;
    while (deleted < options.maxDbRowsPerEntity) {
      const remaining = options.maxDbRowsPerEntity - deleted;
      const limit = Math.min(options.dbBatchSize, remaining);
      const batchDeleted = await this.persistence.deleteExpiredBatch(entity, options.now, limit);
      if (!Number.isSafeInteger(batchDeleted) || batchDeleted < 0 || batchDeleted > limit) {
        throw new Error(`Cleanup persistence returned an invalid ${entity} batch size.`);
      }
      deleted += batchDeleted;
      if (batchDeleted < limit) return { deleted, limitReached: false };
    }
    return { deleted, limitReached: true };
  }

  private async cleanupAvatars(
    options: CleanupOptions,
    identityAudit: AvatarIdentityAudit,
  ): Promise<AvatarCleanupResult> {
    // Dependencies were preflighted before database cleanup. The aliases keep the
    // invariant explicit to TypeScript without weakening the public constructor.
    const avatarStore = this.avatarStore;
    if (!avatarStore) throw new Error('Avatar cleanup preflight failed.');

    const result = emptyAvatarResult(options.avatarMode, identityAudit);
    const oldEnoughAt = options.now.getTime() - options.avatarGracePeriodMs;
    const seenContinuationTokens = new Set<string>();
    let continuationToken: string | undefined;
    let firstPage = true;
    let lastScannedKey: string | undefined;

    while (true) {
      // `maxAvatarObjects` is a validated positive integer, a page never yields more than the
      // `remaining` it was asked for, and the loop re-enters only past the limit check at the
      // bottom — which breaks once the budget is spent. So the budget is always live here.
      // This asserts that rather than re-checking it: the previous check was unreachable, and
      // its body set `limitReached` without the `nextStartAfter` the bottom check pairs with,
      // so had it ever run it would have reported a resumable scan with nowhere to resume from.
      const remaining = options.maxAvatarObjects - result.scanned;
      if (remaining <= 0) {
        throw new Error('Avatar cleanup scanned past its own object budget.');
      }
      const requestedPageSize = Math.min(options.avatarPageSize, remaining);
      const page = await avatarStore.listAvatarObjects(
        continuationToken,
        requestedPageSize,
        firstPage ? options.avatarStartAfter : undefined,
      );
      firstPage = false;
      if (page.objects.length > requestedPageSize) {
        throw new Error('Avatar object store returned more objects than the requested page size.');
      }
      const candidates: string[] = [];

      for (const object of page.objects) {
        result.scanned += 1;
        lastScannedKey = object.key;
        if (!isSafeAvatarKey(object.key)) {
          result.skippedUnsafe += 1;
          continue;
        }
        if (!object.lastModified || !Number.isFinite(object.lastModified.getTime())) {
          result.skippedMissingTimestamp += 1;
          continue;
        }
        if (object.lastModified.getTime() > oldEnoughAt) {
          result.skippedRecent += 1;
          continue;
        }
        candidates.push(object.key);
      }

      if (candidates.length > 0) {
        const selection =
          options.avatarMode === 'apply'
            ? await this.persistence.claimUnreferencedAvatarKeys(candidates)
            : await this.dryRunSelection(candidates);
        this.assertValidSelection(candidates, selection);
        const qualifiedOrphans = candidates.filter((key) => selection.claimed.has(key));
        result.referenced += selection.referenced.size;

        result.orphaned += qualifiedOrphans.length;
        this.recordOrphanSamples(result, qualifiedOrphans);
        if (options.avatarMode === 'apply' && qualifiedOrphans.length > 0) {
          try {
            // S3 DeleteObjects accepts at most 1000 keys; page size has the same bound.
            await avatarStore.deleteAvatarObjects(qualifiedOrphans);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            await this.persistence.markAvatarDeletionFailed(qualifiedOrphans, message);
            throw error;
          }
          await this.persistence.markAvatarDeletionSucceeded(qualifiedOrphans, options.now);
          result.deleted += qualifiedOrphans.length;
        }
      }

      continuationToken = page.nextContinuationToken;
      if (continuationToken) {
        if (seenContinuationTokens.has(continuationToken)) {
          throw new Error('Avatar object listing returned a repeated continuation token.');
        }
        seenContinuationTokens.add(continuationToken);
      }
      if (!continuationToken) break;
      if (result.scanned === options.maxAvatarObjects) {
        result.limitReached = true;
        result.nextStartAfter = lastScannedKey ?? options.avatarStartAfter ?? null;
        break;
      }
    }

    return result;
  }

  private assertValidIdentityAudit(audit: AvatarIdentityAudit): void {
    if (!Number.isSafeInteger(audit.drifted) || audit.drifted < 0) {
      throw new Error('Cleanup persistence returned an invalid avatar identity audit.');
    }
    if (audit.samples.length > audit.drifted || audit.samplesTruncated !== (audit.drifted > audit.samples.length)) {
      throw new Error('Cleanup persistence returned an inconsistent avatar identity audit.');
    }
  }

  private async dryRunSelection(keys: readonly string[]): Promise<AvatarClaimResult> {
    const referenced = await this.persistence.findReferencedAvatarKeys(keys);
    return {
      referenced,
      claimed: new Set(keys.filter((key) => !referenced.has(key))),
    };
  }

  private assertValidSelection(keys: readonly string[], selection: AvatarClaimResult): void {
    const expected = new Set(keys);
    for (const key of selection.referenced) {
      if (!expected.has(key) || selection.claimed.has(key)) {
        throw new Error('Cleanup persistence returned an invalid avatar claim selection.');
      }
    }
    for (const key of selection.claimed) {
      if (!expected.has(key)) {
        throw new Error('Cleanup persistence returned an invalid avatar claim selection.');
      }
    }
    if (selection.referenced.size + selection.claimed.size !== expected.size) {
      throw new Error('Cleanup persistence did not classify every avatar candidate.');
    }
  }

  private recordOrphanSamples(result: AvatarCleanupResult, keys: readonly string[]): void {
    const available = ORPHAN_SAMPLE_LIMIT - result.orphanSamples.length;
    result.orphanSamples.push(...keys.slice(0, Math.max(0, available)));
    if (keys.length > available) result.orphanSamplesTruncated = true;
  }
}
