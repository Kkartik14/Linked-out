# API tests

Two layers, deliberately separate.

| Layer | Command | What it proves |
|---|---|---|
| **Unit** (`test/unit/`) | `pnpm --filter @linkedout/api test:unit` | Services, guards, pipes, mappers and cursor helpers in isolation, with fake repositories. Fast, no I/O. |
| **Integration** (`test/integration/`) | `pnpm --filter @linkedout/api test:integration` | The **real** NestJS server over HTTP against a **real** Postgres. Nothing is mocked. |

## Running the integration suite

```bash
pnpm db:up            # Postgres in Docker
pnpm db:test:setup    # creates linkedout_test + applies migrations
pnpm build            # contracts → db → api
pnpm --filter @linkedout/api test:integration
```

Or in one shot from the repo root: `pnpm test:integration`.

The suite boots two API processes (one with R2 configured, one without, so
`UPLOADS_DISABLED` is exercised against a real boot), truncates `linkedout_test` between
tests, and tears everything down at the end. It never touches the `linkedout` dev database.

## How it is organised

`index.test.cjs` boots the server once, then requires each file under `subparts/`. One
process, one server, serial execution — so the database can be truncated deterministically
between tests.

| Subpart | Covers |
|---|---|
| `01-meta` | `/meta/enums`, `/openapi.json`, `/tags/popular` |
| `02-auth` | `/auth/me`, refresh rotation, logout, OAuth redirects, expired/forged cookies |
| `03-ls-create` | `POST /ls` — defaults, limits, reputation, onboarding gate |
| `04-ls-visibility` | The full PUBLIC / FOLLOWERS / PRIVATE viewer matrix |
| `05-ls-update-delete` | Ownership, battle `resolvedAt` rules, reputation withdrawal, cascades |
| `06-feed` | `/feed` + `/feed/following`: sorts, filters, keyset pagination |
| `07-reactions` | Idempotency, counters, trending weights, `buildersHelped` |
| `08-comments` | One-level threading, `commentCount`, cascade delete |
| `09-follows` | Idempotency, self-follow, counts, notification once |
| `10-collections` | CRUD, ordering/position, viewer-aware `lCount` |
| `11-notifications` | Folding via `dedupeKey`, server-composed copy, read state |
| `12-search` | Postgres FTS ranking, visibility, hostile queries |
| `13-users-profile` | Profile, `PATCH /users/me`, username rules, avatar-URL ownership |
| `14-journey-saved` | Journey ordering by `eventDate ?? createdAt`; `/me/saved` |
| `16-uploads` | Presign shape, size/type limits, `UPLOADS_DISABLED` |
| `17-anonymity` | `author: null` on every surface that can carry an author |
| `18-contract-invariants` | Envelopes, cursors, ULIDs, ISO timestamps, CORS, error codes |
| `19-rate-limit` | 120 reads/min, 30 writes/min, `Retry-After`, per-identity buckets |
| `20-concurrency-edges` | Counter integrity under concurrent writes; coercion edges |

## The contract is the oracle

`expectShape(res, schema)` parses every successful response with the **same Zod schema the
frontend imports** from `@linkedout/contracts`. A shape drift fails the suite rather than
the client. `expectError(res, status, code)` asserts the `{ error: { code, message } }`
envelope and its stable machine code.

## Auth without OAuth

OAuth cannot run headlessly, so `_harness.cjs` mints the same HS256 `lo_access` cookie
`TokenService` issues. Everything downstream — the guard, the JWT strategy, the DB user
lookup — is the production code path.
