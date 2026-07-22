# Changelog — LinkedOut backend

Notable changes to `apps/api`, `packages/contracts`, `packages/db`, backend maintenance tooling,
and their CI/test boundaries. Newest first.

## [Unreleased]

### Changed

- Removed Journey timeline and Collections vertically from the v1 contract, route registry,
  OpenAPI, Nest modules, L detail reads, reputation, seed/test harness, and current Prisma schema.
  The forward migration drops Collection storage; Saved remains the independent `SAVED` reaction.
- Reduced `LType` to `L`, `WIN`, `STORY`, `SCAR`, `PLOT_TWIST`, and `BATTLE`. The forward migration
  reclassifies existing `CHECKPOINT`/`LESSON` rows as `L`, removes `lessonsShared`, and replaces the
  PostgreSQL enum without changing L identities or related records.
- Retired the `Builders Helped` reputation metric from the public contract, metadata, write
  plans, profile/sidebar queries, seed reconstruction, and database schema. `HELPFUL` remains a
  fixed reaction with its existing popularity weight and notification behavior.
- Split browser-session policy/orchestration from its Prisma persistence adapter. Opaque-token
  generation, collision retries, and timeout semantics now depend on a typed persistence seam;
  Prisma CRUD, row locking, transactions, and raw SQL remain localized in the adapter.
- Default every non-explicit response to `Cache-Control: private, no-store, max-age=0`; static
  viewer-independent metadata keeps its explicit public cache policy.
- Added an explicit `PUBLIC_OAUTH_CALLBACK_BASE_URL` for the future handoff cutover, distinct from
  the private API origin, while legacy mode continues to use the current API callback URL.
- Added sanitized auth/principal rejection telemetry that excludes headers, cookies, query strings,
  OAuth codes, request bodies, and internal assertions.
- Consolidated the pre-launch resource APIs into the sole `/v1` surface. The clean schemas now
  live at the root `@linkedout/contracts` export; duplicate controllers, guards, mappers, OpenAPI,
  fixtures, and compatibility tests were deleted. The matching database migration removes the
  retired L metadata columns and rebuilds full-text search from title and story.
- Legacy logout no longer requires a live 15-minute access cookie: it revokes an optional refresh
  session first, clears both cookies, and returns 200 for absent, stale, or repeated requests.
- Completed CONTRACT-01B for the public API: query objects now reject unknown parameters,
  OAuth start accepts only its documented `returnTo`, and user searches reject the L-only category
  filter instead of silently ignoring it.
- The OAuth failure contract now publishes safe server-owned display copy, and the Top-Ls
  aggregate supplies its own window caption so clients no longer compose either business message.
- Removed unauthenticated OAuth display copy from redirect query strings. Redirects now carry only
  the validated failure code; clients take the corresponding copy from the versioned shared
  contract, preventing attacker-authored links from presenting trusted-looking messages.

### Added

- Added the approved consumer password policy for credential creation and reset: 8–128 characters,
  no composition rules, a local obvious-password fallback, and HIBP Pwned Passwords range checks
  that disclose only a five-character hash prefix. Provider failures time out and fail open after
  local checks; compromised values return stable `422 PASSWORD_COMPROMISED` without consuming the
  valid OTP. Password login remains offline and Argon2id-backed.
- Added first-party email/password authentication with an emailed 8-digit one-time code
  (`/v1/auth/email/{signup,verify,login,resend,password/forgot,password/reset}`). Codes are HMAC
  digested (never stored in plaintext), valid for 10 minutes, single-use, and exhausted after five
  wrong entries — the attempt check, constant-time compare, and consumption run in one row-locked
  transaction so those limits hold under concurrent requests. Passwords are Argon2id; login,
  signup, and forgot-password responses are non-enumerating; a password reset revokes every
  session. Verification and login reuse the existing OAuth session handoff (no second session
  type). Delivery is behind a replaceable seam with a config-gated, secret-protected stub inspector.
  The account password is authored at `verify`, by the holder of the emailed code — never collected
  at signup — which closes the account pre-hijacking window (Sudhodanan & Paverd, USENIX Security
  2022): there is no pre-verification credential for a third party to seed or overwrite.
- Added indexed, weighted prefix search for Ls from the first character. Completed terms retain
  English stemming, the actively typed final token uses source-preserving lexemes, and existing
  privacy checks, title-over-story ranking, and deterministic keyset pagination remain intact.
- Added separate `/v1/health/private-api`, `/v1/health/database`, and
  `/v1/health/session-authority` operational probes, published in generated OpenAPI as internal
  operations so monitors can distinguish process, database, and session-store failures.
- Added the accepted API-owned BFF session lifecycle. OAuth handoff exchange now creates the
  authoritative server session in the same transaction that consumes the one-time code, then
  returns `{ cookie, expiresAt, returnTo }`, where `expiresAt` is the browser cookie's 90-day
  absolute cap rather than the sliding 30-day idle boundary. Session resolution returns a
  Nest-issued ≤60-second user assertion or `invalid | expired | revoked`; revocation is
  tombstone-first and idempotent. Purpose-scoped BFF caller assertions use a dedicated
  `BFF_CALLER_SECRET`, while the distinct Nest-only `INTERNAL_API_SECRET` signs user identity, so
  the web tier has neither database access nor authority to fabricate `{ sub, sid }`. Verified
  internal calls use dedicated persisted rate budgets and are never exempted by header presence;
  rejected assertions have a separate IP abuse budget because guards precede interceptors. All
  lifecycle routes are internal v1-only, require private ingress at deployment, and the web client
  refuses plaintext internal transport in production.
- Extended bounded maintenance cleanup to delete OAuth handoffs only after expiry, retaining
  consumed rows as replay tombstones for the full lifetime of any issued code.
- Bound every authenticated mutation to the principal that composed it. Unsafe requests now
  require `X-LinkedOut-Principal`; missing, malformed, duplicate, or stale identities fail with
  `409 PRINCIPAL_MISMATCH` before business logic, covering both legacy cookies and API-issued
  internal assertions.
  This is a strict coordinated cutover: callers must forward the composition-time value unchanged
  and must never replace it with the identity resolved when the request executes.
- Made `@linkedout/session-authority` consumable from the deliberately separate web workspace by
  replacing its workspace-only database edge with the same local file-link topology used by the
  shared contracts package. The accepted topology keeps this package behind Nest; the web tier
  consumes only shared contracts and the BFF-caller signer.

### Documentation

- Added this backend-specific changelog. Internal design and contract narratives now live in the
  ignored local documentation set; shared Zod contracts and generated v1 OpenAPI remain the
  tracked executable API references.
- Removed the obsolete public-doc sync command and its prose-only CI test after the canonical
  narrative moved local; credential behavior remains gated at the executable route/OpenAPI seam.

## [1.1.0] — 2026-07-17

Introduces the clean API contract used by the frontend, adds the feed discovery aggregate, and
hardens the backend's contract, persistence, privacy, performance, and verification boundaries.
That contract is now the sole v1 surface.

### Added

- Added the private BFF-to-Nest assertion path with a dedicated secret, strict HS256
  issuer/audience/purpose validation, a 60-second maximum lifetime, authoritative-header
  precedence, and explicit invalid/expired/infrastructure outcomes during legacy coexistence.
- Added the durable browser-session authority for the one-origin BFF: 256-bit opaque cookies are
  stored only by hash, live sessions slide monotonically for 30 idle days with a 90-day cap, and
  logout revokes a persistent tombstone idempotently.
- Extended bounded maintenance cleanup to purge idle/absolute-expired browser sessions and retain
  revoked tombstones until already-issued internal assertions have expired.

- **A complete `/v1` API surface** backed by `@linkedout/contracts`.
  Existing resources retain their behavior unless the clean contract explicitly changes their shape or query.
- **`GET /v1/feed/sidebar`**, one optional-auth aggregate for viewer state, People to Follow, Top
  Ls, and L of the day.
  - People suggestions rank mutual follows, distinct 30-day public-writing activity, follower
    count, and user ID; the API supplies the reason and follow permission.
  - Top Ls rank distinct external actors over a rolling seven-day window. `SAVED` and author
    self-interactions do not count.
  - L of the day uses the previous completed UTC day, persists a deterministic winner per date,
    and reselects if the winner becomes ineligible.
  - The response is viewer-dependent, rehydrates current cards, rechecks visibility/anonymity,
    and sends `Cache-Control: private, no-store, max-age=0`.
- **Generated v1 OpenAPI** at `/v1/openapi.json`, derived from runtime Zod schemas and registered
  route contracts rather than hand-maintained shapes.
- **Strict optional authentication.** A missing credential receives the guest view; a presented
  invalid or expired credential receives 401 consistently, including `/v1/auth/me`.
- Database support for sidebar interaction windows and daily selection, including covering/
  partial indexes and deterministic selection storage.
- Backend and CI gates for route/OpenAPI parity, contract timestamp validation, sidebar ranking
  invariants, SQL-only database objects, test inventory, and executable contract drift.

### Changed

- The canonical v1 L removes `category`, `company`, `tags`, `eventDate`, and the derived journey
  `date`. Journeys expose `createdAt` and order by `(createdAt, id)` ascending.
- Feed and search queries no longer accept category filters. `/v1/tags/popular` does not exist,
  and removed types are not exported from the root contract.
- Create/update bodies are strict and reject removed or unknown keys. PATCH bodies require at
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

- The API-owned `lo_sid` lifecycle is implemented, but the public BFF proxy/callback/logout route
  handlers and coordinated cookie cutover are still pending. Until that outer response boundary is
  deployed, production continues to use the legacy 15-minute access cookie and rotating 30-day
  refresh session.

## [1.0.1] — 2026-07-15

Hardens the original modular monolith before the clean-contract cutover.

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
