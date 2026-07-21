# API tests

Two layers, deliberately separate.

| Layer | Command | What it proves |
|---|---|---|
| **Unit** (`test/unit/`) | `pnpm --filter @linkedout/api test:unit` | Rebuilds first so imports from `dist/` cannot be stale, then tests services, guards, pipes, mappers and cursor helpers in isolation with fake repositories. No database or network I/O. |
| **Integration** (`test/integration/`) | `pnpm --filter @linkedout/api test:integration` | The **real** NestJS server over HTTP against a **real** Postgres. Nothing is mocked. |

`test:unit:built` is the same unit suite without the rebuild, for when `dist/` is already current
— CI uses it because the workflow builds once and shares the artifact. Both run
`scripts/check-unit-test-inventory.cjs` first: `node --test` exits 0 when its glob matches
nothing, so without that check a renamed or moved file would leave the suite green and empty.

## Running the integration suite

The one-shot command from the repo root sets everything up, including the mandatory guard env:

```bash
pnpm test:integration     # build → bootstrap+migrate the test DB → run the suite
```

To run the pieces by hand, the destructive steps require the guard env (they fail closed
without it):

```bash
pnpm db:up                                                        # Postgres in Docker
pnpm build                                                        # contracts → db → api (before setup)
ALLOW_TEST_DB_RESET=1 TEST_DB_EXPECTED_SESSION_USER=linkedout \
  pnpm db:test:setup                                             # bootstrap marker + migrate
ALLOW_TEST_DB_RESET=1 TEST_DB_EXPECTED_SESSION_USER=linkedout \
  pnpm --filter @linkedout/api test:integration
```

> **Upgrading an existing `linkedout_test`?** The marker is now planted only on a *virgin*
> database (see below). If you have a pre-existing migrated `linkedout_test`, drop it once
> (`docker exec linkedout-postgres psql -U linkedout -d postgres -c 'DROP DATABASE linkedout_test;'`)
> and re-run setup so it is bootstrapped cleanly.

The suite boots two API processes (one with R2 configured, one without, so
`UPLOADS_DISABLED` is exercised against a real boot), truncates `linkedout_test` between
tests, and tears everything down at the end.

### Test-database safety (fail-closed)

Every destructive operation — `prisma migrate deploy` (destructive DDL) and the between-test
`TRUNCATE` — is guarded by [`scripts/db-safety-guard.cjs`](../../../scripts/db-safety-guard.cjs).
Two separated responsibilities:

- **Bootstrap** ([`scripts/bootstrap-test-db.cjs`](../../../scripts/bootstrap-test-db.cjs)) — the
  one operation that *creates* the marker. It runs against a fresh DB and refuses unless the
  **URL host is loopback** (`localhost`/`127.0.0.1`/`::1`; override with
  `TEST_DB_ALLOW_NONLOOPBACK_BOOTSTRAP=1` for a known-ephemeral remote), and it refuses to
  claim a **populated** database that has no marker. It stores the cluster's
  `system_identifier` as the marker fingerprint, in a dedicated `linkedout_guard` schema so it
  never trips Prisma's "schema not empty" check.
- **Verify** (migrate wrapper + reset harness) — routine execution *only verifies* an existing
  marker; it never creates one.

Verification checks, in order:

1. `ALLOW_TEST_DB_RESET=1` — explicit opt-in, **scoped to the destructive step only**,
2. the configured URL's name is in the **exact allowlist** `TEST_DB_ALLOWED_NAMES` (default `linkedout_test`) — no regex,
3. the **actually connected** database (`current_database()`) is in that allowlist,
4. configured and connected names agree (no silent redirect),
5. `session_user` matches the **mandatory** `TEST_DB_EXPECTED_SESSION_USER` (the login role, not the mutable `current_user`),
6. the fingerprinted marker exists **and its stored fingerprint matches this cluster's `system_identifier`** — so a dump restored onto a **different cluster** fails. It does **not** distinguish databases within one cluster (the exact-name control does). A **physical clone** (pg_basebackup/restore) keeps the same identifier, name, role, and marker, so it passes everything — physical clones are **outside the guarantee; never point the suite at one.**

The verify + destructive SQL run in **one transaction** (`guardedReset`). Migrations go through
[`scripts/migrate-test-db.cjs`](../../../scripts/migrate-test-db.cjs), which rejects any
disagreement among `TEST_DATABASE_URL` / `DATABASE_URL` / `DIRECT_URL` and forces Prisma to use
the single verified URL for both datasource variables. Guard coverage lives in
`test/unit/db-safety-guard.test.cjs` and `test/unit/migrate-wrapper.test.cjs`.

> **Not yet done (deferred infra):** the test role is still the `linkedout` superuser. A
> genuine `linkedout_test_runner` role that can mutate only `linkedout_test` is recommended
> before this is treated as airtight; the guard already enforces whatever role you pin via
> `TEST_DB_EXPECTED_SESSION_USER`.

## How it is organised

`index.test.cjs` boots the server once, then requires every file under `subparts/` — discovered
by glob and sorted, so the numeric prefix still fixes the order and a new subpart cannot be
forgotten. One process, one server, serial execution — so the database can be truncated
deterministically between tests.

| Subpart | Covers |
|---|---|
| `01-meta` | Enum metadata, the sole generated OpenAPI document, and removed `/tags/popular` |
| `02-auth` | `/auth/me`, refresh rotation, logout, OAuth redirects, expired/forged cookies |
| `03-ls-create` | `POST /ls` — defaults, limits, reputation, onboarding gate |
| `04-ls-visibility` | The full PUBLIC / FOLLOWERS / PRIVATE viewer matrix |
| `05-ls-update-delete` | Ownership, battle `resolvedAt` rules, reputation withdrawal, cascades |
| `06-feed` | Global + following feeds: sorts, strict queries, keyset pagination |
| `07-reactions` | Idempotency, counters, and popularity weights |
| `08-comments` | One-level threading, `commentCount`, cascade delete |
| `09-follows` | Idempotency, self-follow, counts, notification once |
| `10-collections` | CRUD/detail, ordering/position, viewer-aware `lCount` |
| `11-notifications` | Folding via `dedupeKey`, server-composed copy, read state |
| `12-search` | Postgres FTS/user ranking, visibility, strict queries, hostile queries |
| `13-users-profile` | Profile, `PATCH /users/me`, username rules, avatar-URL ownership |
| `14-journey-saved` | Created-at journeys and `/me/saved` visibility/pagination |
| `16-uploads` | Presign shape, size/type limits, `UPLOADS_DISABLED` |
| `17-anonymity` | Strong anonymity: no author, profile/journey, or collection attribution path |
| `18-contract-invariants` | Envelopes, cursors, ULIDs, ISO timestamps, CORS, error codes |
| `19-rate-limit` | 120 reads/min, 30 writes/min, `Retry-After`, per-identity buckets |
| `20-concurrency-edges` | Counter integrity under concurrent writes; coercion edges |
| `21-feed-sidebar` | `GET /v1/feed/sidebar`: viewer states, ranking, windows, daily selection |
| `22-public-api` | The clean L shape, strict bodies, and sole generated OpenAPI surface |
| `23-auth-uniformity` | A presented bad credential is rejected consistently across optional-auth reads |

## The contract is the oracle

`expectShape(res, schema)` parses every successful response with the **same Zod schema the
frontend imports** from `@linkedout/contracts`. A shape drift fails the suite rather than
the client. `expectError(res, status, code)` asserts the `{ error: { code, message } }`
envelope and its stable machine code.

## Auth without OAuth

OAuth cannot run headlessly, so `_harness.cjs` mints the same HS256 `lo_access` cookie
`TokenService` issues. Everything downstream — the guard, the JWT strategy, the DB user
lookup — is the production code path.
