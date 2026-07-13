import { S3Client } from '@aws-sdk/client-s3';
import { createPrismaClient } from '@linkedout/db';

// Load the same cwd-relative .env file as the API composition root before the
// standalone command constructs AppConfigService. Injected process env still wins.
import '../config/config.module';
import { AppConfigService } from '../config/app-config.service';
import { isAvatarListingCursor } from '../common/avatar/avatar-object';
import {
  CleanupJob,
  DEFAULT_CLEANUP_OPTIONS,
  type AvatarCleanupMode,
  type CleanupOptions,
} from './cleanup.job';
import { PrismaCleanupPersistence } from './prisma-cleanup.persistence';
import { R2AvatarObjectStore } from './r2-avatar-object.store';

export const CLEANUP_HELP = `Usage: pnpm maintenance:cleanup [options]

Database cleanup is applied in bounded batches. Avatar cleanup is a dry run unless
--apply-assets is explicitly supplied.

Options:
  --apply-assets             Delete qualifying orphaned avatars
  --skip-assets              Do not inspect object storage
  --db-batch-size=N          Rows per delete statement (default: 500, max: 10000)
  --max-db-rows=N            Per-table deletion cap per run (default: 100000)
  --asset-grace-hours=N      Minimum object age (default: 48, max: 8760)
  --asset-page-size=N        R2 list page size (default: 500, max: 1000)
  --max-asset-objects=N      Maximum R2 objects scanned per run (default: 100000)
  --asset-start-after=KEY    Resume after the previous result.nextStartAfter key
  --help                     Print this help
`;

function parseBoundedInteger(
  flag: string,
  value: string,
  minimum: number,
  maximum: number,
): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${flag} must be an integer between ${minimum} and ${maximum}.`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

export function parseCleanupArgs(args: readonly string[]): CleanupOptions {
  let avatarMode: AvatarCleanupMode = DEFAULT_CLEANUP_OPTIONS.avatarMode;
  let dbBatchSize = DEFAULT_CLEANUP_OPTIONS.dbBatchSize;
  let maxDbRowsPerEntity = DEFAULT_CLEANUP_OPTIONS.maxDbRowsPerEntity;
  let avatarGraceHours = DEFAULT_CLEANUP_OPTIONS.avatarGracePeriodMs / (60 * 60 * 1000);
  let avatarPageSize = DEFAULT_CLEANUP_OPTIONS.avatarPageSize;
  let maxAvatarObjects = DEFAULT_CLEANUP_OPTIONS.maxAvatarObjects;
  let avatarStartAfter = DEFAULT_CLEANUP_OPTIONS.avatarStartAfter;
  let sawApplyAssets = false;
  let sawSkipAssets = false;
  const valuedFlags = new Set<string>();

  for (const arg of args) {
    if (arg === '--apply-assets') {
      sawApplyAssets = true;
      avatarMode = 'apply';
      continue;
    }
    if (arg === '--skip-assets') {
      sawSkipAssets = true;
      avatarMode = 'skip';
      continue;
    }

    const separator = arg.indexOf('=');
    const flag = separator === -1 ? arg : arg.slice(0, separator);
    const value = separator === -1 ? '' : arg.slice(separator + 1);
    if (valuedFlags.has(flag)) throw new Error(`Cleanup option ${flag} was provided more than once.`);

    switch (flag) {
      case '--db-batch-size':
        dbBatchSize = parseBoundedInteger(flag, value, 1, 10_000);
        break;
      case '--max-db-rows':
        maxDbRowsPerEntity = parseBoundedInteger(flag, value, 1, 10_000_000);
        break;
      case '--asset-grace-hours':
        avatarGraceHours = parseBoundedInteger(flag, value, 1, 8760);
        break;
      case '--asset-page-size':
        avatarPageSize = parseBoundedInteger(flag, value, 1, 1000);
        break;
      case '--max-asset-objects':
        maxAvatarObjects = parseBoundedInteger(flag, value, 1, 10_000_000);
        break;
      case '--asset-start-after':
        if (!isAvatarListingCursor(value)) {
          throw new Error(`${flag} must be an object key inside the avatars/ namespace.`);
        }
        avatarStartAfter = value;
        break;
      default:
        throw new Error(`Unknown cleanup option: ${arg}`);
    }
    valuedFlags.add(flag);
  }

  if (sawApplyAssets && sawSkipAssets) {
    throw new Error('--apply-assets and --skip-assets cannot be combined.');
  }

  return {
    now: new Date(),
    dbBatchSize,
    maxDbRowsPerEntity,
    avatarMode,
    avatarGracePeriodMs: avatarGraceHours * 60 * 60 * 1000,
    avatarPageSize,
    maxAvatarObjects,
    avatarStartAfter,
  };
}

export async function runCleanupCommand(args: readonly string[]): Promise<void> {
  const options = parseCleanupArgs(args);
  const config = new AppConfigService();
  const r2 = config.r2;
  if (options.avatarMode !== 'skip' && !r2.configured) {
    throw new Error('R2 must be fully configured unless --skip-assets is supplied.');
  }

  const db = createPrismaClient();
  const r2Client =
    options.avatarMode === 'skip'
      ? undefined
      : new S3Client({
          region: 'auto',
          endpoint: r2.endpoint,
          credentials: {
            accessKeyId: r2.accessKeyId,
            secretAccessKey: r2.secretAccessKey,
          },
        });

  try {
    await db.$connect();
    const objectStore = r2Client ? new R2AvatarObjectStore(r2Client, r2.bucket) : undefined;
    const job = new CleanupJob(
      new PrismaCleanupPersistence(db),
      objectStore,
    );
    const result = await job.run(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    r2Client?.destroy();
    await db.$disconnect();
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    if (args.length !== 1) {
      process.stderr.write('--help cannot be combined with cleanup options.\n');
      process.exitCode = 1;
    } else {
      process.stdout.write(CLEANUP_HELP);
    }
  } else {
    void runCleanupCommand(args).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`cleanup failed: ${message}\n`);
      process.exitCode = 1;
    });
  }
}
