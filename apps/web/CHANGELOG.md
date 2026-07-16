# Changelog — @linkedout/web

Notable changes to the LinkedOut frontend. Newest first.

This file covers `apps/web` only. The API contract it builds against is versioned
separately: `local/contract.md` (v1, live) and `docs/api-contract-v2.md` (v2, target).

## [1.1.0] — 2026-07-17

Adopts the **v2 API contract** and adds the feed's discovery rails.

### Added

- **Feed discovery rails** on `/`, from the single optional-auth `GET /v2/feed/sidebar`
  aggregate. Left: viewer box, then People to Follow in its own container. Right: Top Ls,
  then L of the day. The wire does not encode left/right — placement is a frontend
  decision, recorded in `README.md`.
  - Both rails read one shared principal-scoped query, so they cost a single request.
  - Rendered exactly as returned: the array order is authoritative, `interactionLabel` and
    `reason.text` are shown verbatim, and `viewer.canFollow` is used rather than
    recomputing follow permission.
  - Anonymous Ls appear in Top Ls unattributed and never linked to a profile. L of the day
    cannot be anonymous — `AttributedFeaturedL` types its author as non-null, so that
    branch does not exist rather than being defended against at runtime.
  - Following a suggestion drops the row optimistically, rolls back on failure, then
    invalidates so the backend can rank a replacement into the vacated slot.
  - The viewer box leads with reputation rather than followers, per `product.md`'s "no
    emphasis on followers"; `{n} {label}` is composed from raw counts plus `/meta/enums`.
- `getFeedSidebar()` in the API seam, and a **development fixture** for it
  (`src/lib/api/fixtures/`, gated by `NEXT_PUBLIC_FEED_SIDEBAR_FIXTURE=1`) because the
  route is not deployed yet. The fixture is parsed through `feedSidebarResponseSchema` at
  the seam, so drift from the contract fails loudly instead of rendering a shape the real
  endpoint would never send. It is dynamically imported, so it is dead-code-eliminated
  from production builds.
- `API_V2_BASE_URL` (derived from `API_BASE_URL`, not separately configured) and a
  `baseUrl` override on `apiFetch`, for the one route with no v1 equivalent.
- `queryKeys.feedSidebar` — principal-scoped, because the response carries viewer state.

### Changed

- **All types now come from `@linkedout/contracts/v2`.** The deployed API is still v1;
  this works because v1 responses are a strict superset of v2's and v1's strict write
  schemas accept a v2 body, so the app speaks v2 types to v1 routes until `/v2` ships
  (contract §5). `API_BASE_URL` stays on `/v1`.
- Feed and search no longer send a category `filter`; the feed and search query keys lost
  their `filter` segment accordingly.
- The composer is five fields instead of nine.
- The rails and the feed refresh independently: `refreshAfter` becomes a derived
  `staleTime` rather than a poll, so the rails never reshuffle under a reader.

### Removed

The v2 contract deletes `category`, `company`, `tags` and `eventDate` from the L wire.
v1 still sends all four; the UI now ignores them. Gone from the interface:

- feed and search **category filter chips**, and the `filter` search param — a saved v1 URL
  carrying one still renders the full feed, the param is simply ignored
- the composer's **category, company, event-date and tags** fields, the whole `TagsInput`,
  and its `/tags/popular` autocomplete (that route has no v2 successor)
- the **category badge, company, event date and tag chips** on cards and L detail. Tag
  chips were the only path from a card into search, so that entry point is gone too
- **category and company** on journey timeline nodes
- `lCategory` from meta, and the `categoryLabel` selector

### Known gaps

- **The journey timeline still uses the v1 node.** v2's `JourneyNode` needs `createdAt`,
  which v1 never sends — it sends the `eventDate ?? createdAt` alias as `date` *and orders
  by that alias*. Adopting the v2 node today would render a timeline sorted one way and
  labelled another (a backdated L would sort first but display its publish date). The
  frontend cannot fix that: ordering is the backend's, and re-sorting one cursor page
  would be meaningless. Migrate when `GET /v2/users/:username/journey` ships; both call
  sites carry a comment naming that trigger.
- **The rails run on a fixture** until `GET /v2/feed/sidebar` is deployed. What ships today
  is the wiring, layout and privacy behaviour — not the backend's real ranking.
- Existing Ls look barer immediately: v1 is still serving company, category, tags and event
  date, and we have stopped rendering them. That is the intended v2 end state arriving
  ahead of the backend's removal, not a regression.

### Notes

- `pnpm install` is required in this workspace after the backend rebuilds
  `@linkedout/contracts`: pnpm materialises the `file:` dependency as a copy, not a live
  symlink, so a rebuilt package is otherwise invisible here.

### Verification

Typecheck and lint clean. 84 unit/component tests (was 46). Playwright: 53 passed, 1
skipped (the pre-existing `AUTH-01` fixme) against the real API and real Postgres —
including every pre-existing journey, which is what establishes that the v2 migration did
not break current flows.
