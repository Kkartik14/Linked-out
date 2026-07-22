# LinkedOut — Release Work Tracker

Status: current for 1.1.4 as of 2026-07-23.

This file tracks both completed and unfinished release work. Checked items are implemented and
verified; unchecked items still require implementation or an external/frontend handoff. Runtime
Zod schemas and generated OpenAPI remain authoritative for current wire behavior.

The browser session boundary is deployed on Vercel with `OAUTH_SESSION_MODE=handoff`. The backend
session authority and the frontend public BFF path (proxy, `/v1` route handlers, OAuth handoff
exchange, tombstone logout, session-state, CSRF edge) are implemented, and the handoff-mode browser
acceptance suite (AUTH-01/02/03/05/06/07/08) is green (`pnpm test:e2e:handoff`) and runs as its own
CI gate. Live probes verify the API, Neon, session authority, BFF, public `/v1` proxy, CDN cache
headers, and both OAuth-start redirects.

The remaining production boundary is infrastructure-dependent: the Vercel API hostname is still
network-public even though application traffic uses the web/BFF origin and internal calls remain
cryptographically verified. OAuth provider-console registration and alert/scheduler ownership also
remain external tasks.

## 1. Backend

### Completed in the 1.1.2 backend pass

- [x] Split browser-session policy and orchestration from Prisma persistence behind typed
      interfaces. Token generation, collision retries, timeouts, transactions, row locking, and raw
      SQL now live on the correct side of the session-authority boundary.
- [x] Compose the browser-session authority through the API auth module and cover handoff,
      resolution, persistence, timeout, and collision behavior with integration tests.
- [x] Add an architecture-boundary test that prevents session policy from leaking back into the
      Prisma adapter or API composition root.
- [x] Validate separate public OAuth callback and private API origins at runtime while preserving
      legacy-mode callback behavior until the BFF cutover.
- [x] Bind feed cursors to their selected sort and reject cross-sort reuse with `BAD_CURSOR`.
- [x] Bound the process-local rate-limit lease cache, reserve independent capacity for all three
      fixed BFF operations, and keep health probes callable during limiter saturation or outage.
- [x] Validate runtime error bodies against the declared error-code/detail catalogue and classify
      security telemetry explicitly rather than inferring it from a wire code.

### P0 — Authentication retirement

- [ ] Remove the legacy access/refresh-token path only after the BFF cutover and a bounded
      compatibility window. Do not remove it while browser traffic still calls Nest directly.

## 2. Frontend / BFF

### P0 — One-origin session boundary

Implemented and acceptance-green behind `OAUTH_SESSION_MODE=handoff`; inert in the default `legacy`
mode. The remaining `[ ]` items are gated on the production cutover, not on frontend work.

- [x] Add public-origin BFF route handlers for ordinary `/v1/*` traffic plus OAuth start, callback,
      handoff exchange, and logout (`app/v1/[...path]/route.ts`, `app/v1/auth/logout/route.ts`,
      `app/auth/callback/handoff/route.ts`; OAuth legs relayed through the catch-all). No second
      versioned surface.
- [x] Add a thin Next `proxy.ts` — optimistic protected-route gating + the cache default only; no
      session resolution, locking, refresh, or persistence.
- [x] Route all browser API traffic and both OAuth legs through the public web origin (browser →
      same-origin `/v1`; RSC self-hops through its own `/v1` handler). The browser never calls the
      private Nest origin or receives a Nest assertion.
- [x] On each authenticated upstream request, read `lo_sid`, call the private session-resolve
      endpoint, and forward the Nest-issued short-lived `X-Internal-Auth` assertion.
- [x] Exchange the OAuth handoff at a browser-visible response boundary (`/auth/callback/handoff`
      route), set the host-only `lo_sid`, and redirect only to the server-bound `returnTo`.
- [x] Implement tombstone-first BFF logout: revoke through Nest before clearing `lo_sid`; repeats
      stay 200 for absent/invalid/expired/already-revoked cookies.
- [x] Stop forwarding the browser's complete cookie header to ordinary Nest data requests (only
      `lo_sid` reaches our own `/v1` handler, which strips cookies before Nest).
- [x] Make authenticated HTML and viewer-dependent responses default to
      `Cache-Control: private, no-store, max-age=0`; public caching is an explicit opt-in.
- [ ] Remove `src/lib/public-read.ts` and the legacy access-cookie refresh path. The BFF edge now
      clears a rejected `lo_sid` at the boundary, so the precondition is met — but legacy pages still
      depend on both, so the deletion waits for the production flip to `handoff`.
- [x] Flip both production projects to `OAUTH_SESSION_MODE=handoff` only after the web/BFF and API
      projects, origins, shared caller secret, and browser acceptance path are ready.

### P1 — Session-state correctness

- [x] Preserve a presented invalid or expired credential separately from a clean guest in
      `getSession()` — a 401 now maps to a distinct `rejected` state, not `guest` (contract §0,
      AUTH-06 no-downgrade).
- [x] Publish one debounced session-expiry invalidation when an unrecoverable authenticated request
      returns 401 (leading-edge debounce; gated on the `SESSION_REJECTED` code so a guest 401 does
      not storm every tab).
- [x] Validate/narrow the composed principal before minting `ComposedPrincipal`. `useComposedPrincipal`
      returns `ComposedPrincipal | null` and mints only from a real viewer id; `"anon"` is never
      branded.

### P1 — CSRF boundary

- [x] Reject cookie-authenticated unsafe requests whose `Origin`/`Referer` is not the approved
      public origin.
- [x] Require an approved content type for browser mutations (all unsafe methods; the edge fails
      closed when the header is absent).
- [x] Verify a hostile sibling origin cannot use a valid `lo_sid` (AUTH-07 acceptance test).

### P1 — Accessibility

- [ ] Give Current chapter a visible non-colour cue in every avatar context; the coloured dots alone
      fail WCAG 1.4.1 for sighted colour-blind users.
- [ ] Replace the search/feed navigation-filter `Tabs` patterns that have triggers without owned
      tabpanels, and announce result changes appropriately.
- [ ] Add route-change focus/announcement behavior for client-side navigation.
- [ ] Preserve focus during pending mutations. Reaction and follow controls currently
      become `disabled`; use guarded `aria-disabled` where interaction must be blocked, and add
      `aria-pressed` to the follow toggle.
- [ ] Replace the notifications dropdown's mixed menu/plain-div structure with semantics that make
      every notification, including null-target notifications, keyboard reachable and announced.
- [ ] Disambiguate repeated accessible names for comment/reply/delete controls.
- [ ] Make character limits programmatic and consistent. The composer shows counters but does not
      set native `maxLength`; ensure limits are announced rather than only displayed visually.
- [ ] Change the display-only settings username from `disabled` to `readOnly` and add field-level
      settings errors.
- [ ] Standardize pending form semantics (`aria-busy`/`aria-disabled`) instead of relying only on a
      disabled button plus changing text.

## 3. DevOps / Platform

### P0 — Production topology

- [ ] Make the web/BFF origin the only public ingress for application and OAuth traffic.
- [x] Add repository-owned Vercel deployment configuration for the Nest and Next projects, with
      `/v1` as the only application API version and GitHub `main` as the automatic production CD
      source.
- [ ] Update remaining observability/ingress ownership around that deployment. The Vercel API
      hostname remains reachable directly and no alerting-provider configuration lives here.
- [ ] Make Nest private/non-publicly-routable while retaining cryptographic verification on every
      internal request. Network isolation and assertion verification are both required.
- [x] Add distinct `PUBLIC_OAUTH_CALLBACK_BASE_URL` and private API origin configuration, runtime
      validation, application configuration accessors, test-harness values, and strategy selection.
- [x] Populate the distinct public callback, web/BFF, and private API origins in both Vercel
      production projects. Provider-console registration remains the separate item below.
- [x] Provision distinct `BFF_CALLER_SECRET` and `INTERNAL_API_SECRET` values, separate
      from legacy JWT and OAuth secrets.
- [ ] Register provider callback URLs against the public BFF origin.
- [ ] Execute a bounded migration from domain-scoped `lo_access`/`lo_refresh` cookies to host-only
      `lo_sid`; do not remove the old cookie domain before the BFF boundary exists.
- [x] Make API responses fail closed at the origin with
      `Cache-Control: private, no-store, max-age=0`, retaining explicit public caching only for
      viewer-independent metadata.
- [x] Preserve private/no-store headers through Vercel's CDN. Live production probes verified the
      canonical header on API health, session-authority, BFF, OAuth, and HTML responses while the
      viewer-independent metadata route retained its explicit public cache policy.

### P1 — Operations

- [x] Add distinct private API, database, and session-authority operational probes, shared response
      contracts, generated OpenAPI entries, and integration coverage.
- [x] Add the frontend-owned `/health/bff` liveness probe with canonical private/no-store headers.
- [ ] Add deployment alert rules for the BFF and private dependency probes. No alerting-provider
      configuration exists in this repository.
- [x] Emit sanitized telemetry for auth, OAuth handoff, and principal-binding rejections without
      logging cookies, query strings, OAuth codes, request bodies, or internal assertions.
- [x] Add independently recoverable concurrent keyset-index migrations for author Ls, saved Ls,
      and notifications; verify deployed index validity and planner selection.
- [x] Pin every external GitHub Action to its reviewed immutable SHA and enforce an exact allowlist.
- [x] Document recovery for interrupted concurrent index builds, including invalid-index cleanup
      and Prisma migration resolution.
- [x] Add sanitized BFF CSRF rejection telemetry containing only stable code, method, path, and
      reason; query strings, headers, cookies, and bodies are excluded.
- [x] Keep private health/session-lifecycle routes off the public BFF and allow only the OAuth state
      cookie to cross the Nest-to-browser boundary on OAuth routes.
- [x] Run handoff-mode Playwright acceptance in its own CI job and retain independent retry traces.
- [ ] Gate rollout so old replicas cannot issue or accept the retired cookie topology after the
      compatibility window closes.
- [ ] Configure the deployment scheduler for the bounded maintenance cleanup job described in
      `docs/operations/maintenance-cleanup.md`.

## 4. QA / Acceptance

### Completed backend/platform acceptance

- [x] Audit the complete backend unit inventory and make integration subpart discovery fail if an
      existing backend suite is accidentally renamed or removed.
- [x] Prove full keyset walks terminate without gaps or duplicates for feed, profile L lists,
      Saved, and equal-timestamp notifications; verify repository query shapes match indexes.
- [x] Exercise canonical private cache policy across successes, errors, malformed JSON, OAuth and
      session lifecycle responses, and CORS preflight responses.
- [x] Run backend build, API/DB typechecks, API lint, 156 unit tests, and 387 PostgreSQL integration
      tests against an isolated freshly migrated database.
- [x] Mutation-check cache-policy and production BFF rate-limit reservation tests: both fail when
      their protected behavior is deliberately weakened and pass after restoration.
- [x] Build both Vercel projects from production configuration, deploy commit `866635d` through the
      GitHub `main` integration, and verify live API/database/session/BFF health plus the public
      `/v1` proxy and both OAuth redirect targets.

### P0 — Browser session acceptance

The handoff acceptance suite (`apps/web/e2e/auth-handoff.spec.ts`, `pnpm test:e2e:handoff`) drives
the real one-origin path against real Postgres. AUTH-08 (OAuth relay state preservation) is also
covered.

- [x] Enable AUTH-01: a protected RSC render and client API request remain authenticated beyond the
      former 15-minute access-cookie boundary.
- [x] Prove BFF logout tombstones the row, clears `lo_sid`, and remains idempotent on repeat (AUTH-02).
- [x] Add end-to-end concurrent resolution coverage through the BFF, not only direct authority tests
      (AUTH-05).
- [x] Add AUTH-07 hostile-origin CSRF coverage.
- [x] Remove `test.fixme`/temporary acceptance annotations as their tests become executable and green
      (the placeholder AUTH-01 `test.fixme` is deleted; the real AUTH-01 is live).
- [ ] Replace the access-cookie-only legacy `signIn()` lifecycle. The `lo_sid` fixture and the handoff
      suite (`signInBff`) create a production-shaped row + matching cookie; the legacy suite keeps
      `lo_access` until the flip, since it still runs in legacy mode.
- [x] Add AUTH-06 page-level fault injection: a real resolve outage returns `SESSION_UNAVAILABLE`,
      preserves `lo_sid`, keeps protected navigation out of login, and recovers with the session.
- [x] Complete AUTH-03/FRONTEND-24 with two real tabs and two sessions: reject the first principal's
      stale mounted form without a write, then prove callback invalidation discards its draft and a
      fresh form persists under the second principal.
- [x] Clear an RSC-only rejected `lo_sid` through a browser-visible response boundary rather than
      assuming a server-side self-hop can propagate `Set-Cookie`.

### P1 — Accessibility verification

- [ ] Run a keyboard-only pass after the remaining focus fixes.
- [ ] Run a VoiceOver or NVDA smoke test across feed, auth, composer, comments,
      notifications, profile, search, saved, and settings.

## Completion rule

Work is complete only when runtime behavior, shared contracts, generated OpenAPI, tests, and
operations documentation agree. The remaining auth/session epic requires AUTH-01 to be enabled and
green; increasing token lifetime does not satisfy it.
