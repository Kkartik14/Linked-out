# LinkedOut — Current Architecture

> "LinkedIn for your Ls." This describes the integrated implementation after all eight 1.1.4
> workstreams merged to `main` on 2026-07-23. The final package/OpenAPI version cut is still pending.

## System shape

LinkedOut is a modular monolith with two independently installed workspaces:

- `apps/api` is a NestJS API and owns business policy, authorization, persistence orchestration,
  ranking, privacy, counters, and business copy carried on the API wire. Presentation copy remains
  a frontend concern; two known frontend-composed contract follow-ups are documented in web TODOs.
- `apps/web` is a Next.js App Router application. It is a thin v1 client and has its own lockfile.
- `packages/contracts` owns the shared Zod runtime schemas and inferred TypeScript types.
- `packages/db` owns Prisma, migrations, the generated client, and the ULID client extension.
- PostgreSQL 16 is the only required stateful service. R2/S3-compatible storage is optional for
  avatar uploads. There is no Redis, queue, sharding layer, or microservice split.

The root pnpm workspace intentionally excludes `apps/web`. Root build order is explicit:
`contracts → db → api`; CI shares those outputs with the web, database, integration, and e2e jobs.

## Repository layout

```text
apps/
├── api/
│   ├── src/
│   │   ├── main.ts                 # Nest bootstrap, URI versioning, cookies, CORS, errors
│   │   ├── app.module.ts           # feature composition + global interceptors
│   │   ├── common/                 # guards, contracts, pipes, errors, pagination, read models
│   │   ├── config/                 # one Zod-validated environment boundary
│   │   ├── prisma/                 # the one ULID-extended Prisma client
│   │   ├── maintenance/            # standalone retention/avatar cleanup job
│   │   └── modules/
│   │       ├── auth/               # OAuth, email/password + OTP, legacy cookies, BFF lifecycle
│   │       ├── users/              # profiles, onboarding, reputation, avatar publication
│   │       ├── ls/                 # v1 L CRUD, feeds, and saved items
│   │       ├── feed/               # global/following HTTP adapters
│   │       ├── feed-sidebar/       # people, Top Ls, and daily aggregate
│   │       ├── reactions/          # idempotent reaction plans and counters
│   │       ├── comments/           # one-level threads and notifications
│   │       ├── follows/            # idempotent graph edges
│   │       ├── notifications/      # inbox + server-composed messages
│   │       ├── search/             # PostgreSQL FTS and user trigram search
│   │       ├── uploads/            # presigned avatar PUT URLs
│   │       └── meta/               # enum metadata and generated v1 OpenAPI
│   └── test/                       # unit + real-Postgres HTTP integration suites
└── web/                            # Next.js 16 / React 19 v1 client

packages/
├── contracts/src/                  # sole public v1 schemas and root exports
├── db/
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/          # Prisma + SQL-owned indexes/triggers/generated FTS
│   └── src/ulid.ts                 # monotonic top-level create enforcement
├── internal-auth/                  # purpose-scoped BFF + API assertion signing/verification
└── session-authority/              # session policy plus an isolated Prisma/Postgres adapter
```

## Request and dependency flow

The normal vertical path is:

```text
HTTP → Controller → Service → Repository → Prisma/PostgreSQL → Mapper → wire DTO
```

- Controllers bind routes and contracts, validate input with the custom
  `ZodValidationPipe`, and call a service. There is no `nestjs-zod` dependency.
- Services own business decisions and authorization. Cross-module orchestration goes through an
  exported service, such as comments using `LsService` for visibility or follows using
  `UsersService` for target resolution.
- Repositories own all Prisma/raw SQL and execute atomic persistence plans. Services decide the
  effects; repositories translate those effects into transactions and retry selected write
  conflicts.
- Mappers produce contract DTOs and enforce author redaction/viewer state. Prisma rows never go
  directly to the wire.
- List envelopes are assembled explicitly by services/repositories with `buildPage`/`mapPage`;
  there is no global response-shaping interceptor.

`BffSessionService` delegates to `BrowserSessionAuthority` for opaque-token generation, timeout
policy, credential semantics, and collision orchestration. The authority depends on a typed
persistence seam; `PrismaBrowserSessionPersistence` owns Prisma CRUD, row locking, the atomic OAuth
handoff transaction, and raw SQL.

`ApiContract` route metadata and the same Zod schemas drive controller validation and generated
OpenAPI. Unit tests fail when registered routes, guards, body pipes, schemas, or OpenAPI drift.

## Public contract

- `/v1` and the root `@linkedout/contracts` export are the sole public surface.
- The contract omits `category`, `company`, `tags`, `eventDate`, Journey/Collection resources,
  feed/search category filters, and `/tags/popular`.
- `LType` is exactly `L | WIN | STORY | SCAR | PLOT_TWIST | BATTLE`. Profiles expose those six
  type-filtered tabs and default to `L`.
- `GET /v1/feed/sidebar` supplies the discovery aggregate; changed reads use strict query objects.
- Optional-auth reads distinguish no credential (guest) from a presented invalid/expired
  credential (401).
- Generated OpenAPI is published at `/v1/openapi.json` from the same shared schemas and route
  metadata used at runtime.
- Application responses default to `private, no-store, max-age=0`; genuinely public static
  responses opt into caching explicitly.
- Internal operations probes distinguish the private API process, database connectivity, and the
  browser-session table at `/v1/health/{private-api,database,session-authority}`.

The 1.1.2 migration removed the obsolete persistence columns and rebuilt the stored search vector
from `title` and `story` only. No version compatibility mapper or database normalization remains.

## Authentication — current runtime

1. Browser navigation starts Google/GitHub OAuth through the API.
2. The callback upserts the user/account, creates a hashed refresh `Session`, sets `lo_access`
   (15 minutes) and `lo_refresh` (30 days) as httpOnly SameSite=Lax cookies, and redirects to the
   web callback.
3. `POST /auth/refresh` rotates the refresh session and both cookies. Browser-side refresh is
   single-flight.
4. A missing username means onboarding is required; completing onboarding refreshes the access
   claim once so writes work immediately.

Email and password is a first-party alternative to OAuth (feature 1.1.3, on `feed-email-login`).
Signup carries **only the email** and issues a durable 10-minute, 8-digit OTP challenge (HMAC-digested
at rest; the plaintext code is never stored). The password is **authored at verification, not
signup**: `/verify` receives the code and the password together and creates the user + Argon2id
credential atomically, which closes the account pre-hijacking window (no pre-verification credential
can be seeded). Verify then returns the **same** one-time session handoff OAuth does, and
login/forgot/reset follow the same OTP-plus-handoff pattern. There is no second session type — email
auth reuses the browser-session authority and lands an opaque `lo_sid` session exactly like OAuth, so
the browser completes it through the existing handoff exchange and only under
`OAUTH_SESSION_MODE=handoff`. Responses are account-enumeration safe (generic `202`s; one
`INVALID_CREDENTIALS` for any failed login). Delivery is a stub pending a real email provider; the
contract and behavior are specified in `docs/api-contract-v1.md` §0.1, with backend detail in
`docs/email-auth-backend.md`.

This is not the final browser ingress. `local/docs/adr/0001-auth-session-topology.md` records the
accepted one-origin BFF with a stable host-only `lo_sid`. Its API-owned session lifecycle and split
caller/user assertion keys are implemented; the public Next route handlers, cookie cutover, and
private-ingress deployment are not. Until that coordinated cutover, the 15-minute RSC limitation
remains.

## Persistence and scaling choices

- IDs are monotonic ULIDs assigned by the Prisma client extension. Nested relation creates are
  rejected because the extension cannot safely assign their IDs.
- Feeds use indexed keyset pagination and fan-out on read. `popular` is lifetime weighted
  engagement; it is deliberately not called trending.
- L/reputation counters are synchronously updated in the same database transaction as their
  writes. Follow degree counters are maintained by PostgreSQL triggers.
- Search uses a stored `tsvector` + GIN for Ls and `pg_trgm` for users.
- Rate limits use globally capped PostgreSQL buckets with bounded process-local permit leases.
- Sidebar rankings count distinct external actors in explicit windows. The daily winner is
  persisted per UTC date and revalidated before serving.
- Viewer-dependent mapped cards are never cached. The sidebar response is `private, no-store`.

## Privacy invariants

- `PRIVATE` is owner-only; `FOLLOWERS` requires the follow edge; unauthorized reads return the
  same not-found result as missing content.
- Anonymous Ls always map `author: null`. Non-owners cannot discover anonymous Ls through profile
  type lists.
- Top Ls may include anonymous public content without attribution. L of the day requires a public,
  non-anonymous L from an onboarded author.
- Permissions and viewer reaction/follow state come from the API; the frontend does not infer
  them.

## Operations and verification

- `pnpm maintenance:cleanup` is an external job, not an in-process timer. Database expiry cleanup
  is bounded; avatar deletion is dry-run by default and uses advisory locks plus durable claims.
- Destructive seed/test resets fail closed unless the target name, role, host/cluster fingerprint,
  and explicit opt-in all match.
- CI runs backend build/typecheck/lint, web checks, API unit tests, real-Postgres integration tests,
  migration/schema parity checks, SQL-only object verification, and Playwright e2e tests.
- Node 22 and pnpm 11.10.0 are the pinned toolchain.
