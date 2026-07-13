# Retention cleanup job

`maintenance:cleanup` is the out-of-request retention path for expired authentication
and rate-limit rows plus abandoned avatar uploads. It is an invocable job, not an API
endpoint and not an in-process timer.

## Behavior

- Expired `Session`, `VerificationToken`, and `RateLimitBucket` rows are deleted at or
  before one fixed cutoff captured at job start.
- Database deletes are always applied, use bounded batches, have a per-table cap, and
  use `FOR UPDATE SKIP LOCKED`. A rerun is idempotent and overlapping runners do not
  claim the same database rows.
- R2 listing is pinned to `avatars/`, paginated, and ignores objects without a trustworthy
  `LastModified` value or younger than the grace period (48 hours by default).
- Avatar references use the persisted `User.avatarObjectKey`, not the render URL, so a
  historical CDN host or public-base pathname remains recognized after configuration changes.
- Apply mode takes the same per-key PostgreSQL advisory lock as a profile-image update,
  checks the stable reference, and writes an `AvatarDeletionClaim` before calling R2. The
  durable claim prevents a check/delete race and permanently rejects a deleted key if an old
  browser later tries to publish it.
- Failed object deletes keep their claim and are retried when the object is listed again;
  successful claims remain as tombstones. Keys are immutable ULIDs, so they are never reused.
- Before **any** apply-mode mutation (including database retention deletes), the job audits
  owned-looking `User.image` values against `avatarObjectKey`. Missing or mismatched identities
  fail the whole invocation. Dry-run reports the drift count and bounded samples instead.
- Avatar cleanup is **dry-run by default**. Object deletion requires the explicit
  `--apply-assets` flag. Both the job and the R2 adapter reject keys outside `avatars/`.

The age grace protects the normal presign-upload-profile-update sequence. It also means a
failed upload is retained for at least the configured grace period before it can qualify.

## Runbook

Build once, then run with the same validated environment used by the API:

```bash
pnpm build
pnpm maintenance:cleanup
```

The standalone command loads `.env` from its working directory through the same configuration
loader as the API; already-injected environment variables take precedence. From the repository
root this means the root `.env`, while the package-local command loads `apps/api/.env`.

The default command applies database expiry cleanup and prints an avatar dry-run report.
Review `avatars.orphaned` and the bounded `avatars.orphanSamples` list (the report says
when that sample is truncated). `avatars.identityDrifted` must be zero before apply. Also
inspect `avatars.limitReached`. If it is true, carry `avatars.nextStartAfter` into the next
invocation so a referenced/recent prefix cannot starve later keys:

```bash
pnpm maintenance:cleanup --asset-start-after='avatars/<last-key-from-result>'
```

Then explicitly apply the same policy:

```bash
pnpm maintenance:cleanup --apply-assets
```

For a database-only run, skip object-store construction and network calls:

```bash
pnpm maintenance:cleanup --skip-assets
```

The command still validates the normal API environment at startup; in production that
environment includes the deployment's required R2 variables even when object calls are
skipped.

Available bounds and defaults are shown by `pnpm maintenance:cleanup --help`. In
particular, `--max-db-rows` limits the work per table in one invocation, and
`--asset-grace-hours` can increase (but not eliminate) the safety window.
`--max-asset-objects` independently caps R2 objects scanned (and therefore deletions) per
invocation; page size only controls request batching and does not weaken that blast-radius cap.
When the cap is reached, save `nextStartAfter` and pass it via `--asset-start-after` on the next
run. The cursor is the last scanned object key, so it remains a valid lexicographic checkpoint
even when apply mode deleted that object. Once `limitReached` is false, omit the cursor on the
next scheduled sweep to wrap back to the beginning of the prefix.

### Rolling deployment gate

The migration backfills stable keys for safe, user-owned avatar URLs on any historical host or
base pathname. Before enabling `--apply-assets`, drain API replicas running code from before
`avatarObjectKey`, run dry-run until `identityDrifted` is zero, and only then apply. Do not run
asset apply during a mixed-version rollout: old replicas do not participate in the key lock and
can write URL-only state after the preflight. If drift is reported, reconcile those rows to their
owned object key (or clear an invalid image) and repeat dry-run.

## Scheduling

No deployment scheduler is defined in this repository. Configure the deployment
platform's external scheduler to invoke the built command (for example, daily) with API
environment secrets. Alert on a non-zero exit and retain the JSON result as the run log.
The command returns non-zero on invalid flags, missing required configuration, malformed
R2 pagination, database errors, or any partial R2 delete error. A failed asset batch remains
claimed and can safely retry on the next invocation without becoming referenceable meanwhile.
