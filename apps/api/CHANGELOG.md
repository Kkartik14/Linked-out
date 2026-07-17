# Changelog — LinkedOut backend

Notable changes to `apps/api`, `packages/contracts`, `packages/db`, backend maintenance tooling,
and their CI/test boundaries. Newest first.

## [Unreleased]

### Changed

- Completed CONTRACT-01B for the legacy v1 surface: query objects now reject unknown parameters,
  OAuth start accepts only its documented `returnTo`, and user searches reject the L-only category
  filter instead of silently ignoring it.
- OAuth failure redirects now carry safe server-owned display copy, and the v2 Top-Ls aggregate
  supplies its own window caption so clients no longer need to compose either business message.

### Documentation

- Added this backend-specific changelog. Internal design and contract narratives now live in the
  ignored local documentation set; shared Zod contracts and generated v1/v2 OpenAPI remain the
  tracked executable API references.
- Removed the obsolete public-doc sync command and its prose-only CI test after the canonical
  narrative moved local; credential behavior remains gated at the executable route/OpenAPI seam.

## [1.1.0] — 2026-07-17

Introduces the clean v2 API used by the frontend, adds the feed discovery aggregate, and hardens
the backend's contract, persistence, privacy, performance, and verification boundaries. The live
v1 API remains available during migration.

### Added

- Added the durable browser-session authority for the one-origin BFF: 256-bit opaque cookies are
  stored only by hash, live sessions slide monotonically for 30 idle days with a 90-day cap, and
  logout revokes a persistent tombstone idempotently.

- **A complete `/v2` API surface** backed by `@linkedout/contracts/v2`, served alongside v1.
  Existing resources retain their behavior unless v2 explicitly changes their shape or query.
- **`GET /v2/feed/sidebar`**, one optional-auth aggregate for viewer state, People to Follow, Top
  Ls, and L of the day.
  - People suggestions rank mutual follows, distinct 30-day public-writing activity, follower
    count, and user ID; the API supplies the reason and follow permission.
  - Top Ls rank distinct external actors over a rolling seven-day window. `SAVED` and author
    self-interactions do not count.
  - L of the day uses the previous completed UTC day, persists a deterministic winner per date,
    and reselects if the winner becomes ineligible.
  - The response is viewer-dependent, rehydrates current cards, rechecks visibility/anonymity,
    and sends `Cache-Control: private, no-store, max-age=0`.
- **Generated v2 OpenAPI** at `/v2/openapi.json`, derived from runtime Zod schemas and registered
  route contracts rather than hand-maintained shapes.
- **Strict v2 optional authentication.** A missing credential receives the guest view; a presented
  invalid or expired credential receives 401 consistently, including `/v2/auth/me`.
- Database support for sidebar interaction windows and daily selection, including covering/
  partial indexes and deterministic selection storage.
- Backend and CI gates for v2 route/OpenAPI parity, contract timestamp validation, sidebar ranking
  invariants, SQL-only database objects, test inventory, and executable contract drift.

### Changed

- The canonical v2 L removes `category`, `company`, `tags`, `eventDate`, and the derived journey
  `date`. V2 journeys expose `createdAt` and order by `(createdAt, id)` ascending.
- V2 feed and search queries no longer accept category filters. `/v2/tags/popular` does not exist,
  and removed v1 types are not re-exported from the v2 contract subpath.
- V2 create/update bodies are strict and reject legacy or unknown keys. PATCH bodies require at
  least one recognized field.
- Controller validation, success responses, guards, and OpenAPI now share explicit route-contract
  metadata. The custom Zod pipe maps unknown keys to useful field names.
- Domain write policy lives above persistence: services construct reaction, comment, and L
  mutation plans; repositories atomically execute them without owning HTTP or authorization
  policy.
- OAuth callback failures now preserve stable failure codes instead of silently redirecting as a
  generic success path.
- Reply notifications distinguish “replied to your comment” from “commented on your L.”

### Fixed

- Anonymous authors remain redacted across feeds, detail, saved items, profiles, journeys,
  collections, search, and sidebar surfaces.
- Visibility filtering for collections/profile surfaces no longer leaks private, followers-only,
  or anonymous entries to ineligible viewers.
- Concurrent reactions, comments, collection ordering, L updates/deletes, follows, and notification
  folding preserve authoritative counters and idempotent behavior.
- Comment deletion decrements by the exact one-level subtree, while reply creation rejects replies
  to replies.
- Notification copy uses denormalized totals while excluding an L author's own qualifying
  reaction from “builders helped/related” wording.
- ULID assignment refuses nested relation creates that the Prisma extension cannot intercept,
  preventing silent CUID rows from corrupting keyset order.
- OAuth email-link races, username collisions, stale daily selections, malformed cursors, and
  nullable relation edges now produce deterministic outcomes.

### Performance and data integrity

- Follow degree is persisted on `User` and maintained by ordered PostgreSQL trigger locks; profile
  reads no longer count graph edges on every request.
- Follow lists, comment pages, feed sorts, sidebar interaction windows, user search, retention
  scans, and collection ranks have query-matched indexes.
- Authentication principal lookups are single-flight cached for the lifetime of a short access
  token without caching infrastructure failures as missing users.
- Rate limiting uses shared PostgreSQL buckets with bounded process-local permit leases, enforcing
  one global budget across API instances.
- Collection ordering uses gapped integer ranks with row locking and exceptional rebalance instead
  of rewriting every member on each move.
- Lifetime engagement was renamed from “trending” to **popularity** because it has no decay.

### Operations and safety

- Added the standalone `maintenance:cleanup` job for bounded expired-session/token/rate-limit
  cleanup and safe abandoned-avatar deletion.
- Avatar cleanup is dry-run by default, scans only `avatars/`, uses stable persisted object keys,
  rejects identity drift, coordinates with profile updates through advisory locks, and records
  durable deletion claims for retry/tombstoning.
- Destructive seed and test-database operations fail closed behind explicit opt-ins, exact database
  names, a pinned role, loopback/cluster identity checks, and a fingerprinted marker.
- Migration verification now checks Prisma parity plus SQL-owned generated columns, indexes,
  constraints, functions, triggers, and extensions.
- CI separates backend and frontend signal, reuses one backend build artifact, and retains
  Playwright retry traces even when a later retry passes.

### Known limitation

- Authentication still uses a 15-minute access cookie and rotating 30-day refresh session. The
  one-origin BFF and stable `lo_sid` topology in local ADR 0001 is proposed but not implemented;
  server-rendered requests cannot yet rotate cookies onto the outer browser response.

## [1.0.1] — 2026-07-15

Hardens the original v1 modular monolith before the v2 cutover.

### Added

- Shared route-driven OpenAPI generation, PostgreSQL-backed rate limiting, maintenance cleanup,
  guarded real-database integration setup, and architecture boundary tests.
- Denormalized reaction, popularity, reputation, comment, and follow counters with transaction and
  concurrency coverage.

### Fixed

- Keyset pagination and deterministic tie-breaking across feeds, comments, notifications, follows,
  journeys, saved items, collections, and search.
- Privacy, anonymity, notification folding/copy, OAuth conflicts, avatar ownership, destructive
  database safety, seed reconstruction, and Prisma client invariants.

### Changed

- Removed the unused `lessonLearned` field and rebuilt the generated full-text search vector from
  weighted title and story content.
- Moved write effects into explicit domain plans and kept all persistence access behind feature
  repositories.

## [1.0.0] — 2026-07-07

Initial backend implementation: NestJS API, shared Zod contracts, Prisma/PostgreSQL persistence,
Google/GitHub OAuth, profiles, L CRUD, feeds, reactions, threaded comments, follows, collections,
notifications, search, avatar presigning, cursor pagination, and v1 OpenAPI.
