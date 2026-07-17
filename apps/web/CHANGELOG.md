# Changelog — @linkedout/web

Notable changes to the LinkedOut frontend. Newest first.

This file covers `apps/web` only. The API contract it builds against is documented in
`docs/api-contract-v2.md`.

## [1.1.0] — 2026-07-17

Moves the frontend onto the **v2 API** and adds the feed's discovery rails.

### Added

- **Feed discovery rails** on `/`, from the single optional-auth `GET /feed/sidebar`
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
  - `refreshAfter` becomes a derived `staleTime` rather than a poll: refetching reshuffles
    both rails, so they refresh on remount and after a follow, never under a reader.
  - The aggregate fails independently of the feed — the rails hide, the page stays whole.
- **`src/lib/public-read.ts`** — v2 rejects a presented-but-invalid credential with `401`
  on every optional-auth read instead of silently serving the guest view (contract §2), so
  a stale cookie now fails even a public page. The app cannot clear an httpOnly cookie from
  a Server Component (ADR 0001 §1.1), so it sends those viewers to `/login`: the one
  recoverable answer that neither pretends the credential is valid nor re-fetches as a
  guest, which would just move the forbidden downgrade into the client.
- The feed route is now three landmarks — two `complementary` rails around a `region`
  named "The Feed" — because the same L can appear in both the feed and a rail, and
  "the feed" has to be addressable.

### Changed

- **The app speaks v2 only.** `NEXT_PUBLIC_API_BASE_URL` carries the `/v2` prefix; there is
  no second base URL and no per-call base override.
- Feed and search no longer send a category `filter`; their query keys lost that segment.
- The journey timeline renders `createdAt`. v2 orders the journey by `(createdAt, id)`, so
  the label and the ordering finally agree — v1 sorted by an `eventDate ?? createdAt` alias
  it exposed as `date`.
- The composer is five fields instead of nine.
- `mockUser.id` in the test harness is a real ULID. It was `"u_kartik"`, which fails any
  test that validates the user against the contract.

### Removed

The v2 contract deletes `category`, `company`, `tags` and `eventDate` from the L wire, so
the interface they backed is gone:

- feed and search **category filter chips**, and the `filter` search param — a saved v1 URL
  carrying one still renders the full feed, the param is simply ignored
- the composer's **category, company, event-date and tags** fields, the whole `TagsInput`,
  and its `/tags/popular` autocomplete (that route does not exist in v2)
- the **category badge, company, event date and tag chips** on cards and L detail. Tag
  chips were the only path from a card into search, so that entry point is gone too
- **category and company** on journey timeline nodes
- `lCategory` from meta, and the `categoryLabel` selector

### Fixed

- **The rails were never hidden on narrow viewports.** `cn` is tailwind-merge, and the
  shared rail class carried a base `flex` that cancelled the `hidden` it was composed with
  — same conflict slot, later wins — so both rails rendered at every width, stacked under
  an infinite feed. Each rail now owns its display outright (`hidden` → `lg:flex`/
  `xl:flex`). Two unit guards cover it: the e2e spec false-passed, and jsdom applies no CSS,
  so the merged class list is the only thing that can observe this.
- Suggestion reasons wrap instead of truncating. `reason.text` is server copy of unknown
  length, and a 17rem rail clipped more of it than it kept.
- The feed's sort tabs align to the start when logged out, rather than floating against the
  right edge beside an empty spacer left behind by the category chips.

### Notes for the next person

- `pnpm install` is required in this workspace after the backend rebuilds
  `@linkedout/contracts`: pnpm materialises the `file:` dependency as a copy, not a live
  symlink, so a rebuilt package is otherwise invisible here.
- `pnpm --filter @linkedout/db migrate:deploy` after the backend adds a migration. An
  un-migrated dev database makes the API answer `500`, which reads like a frontend bug.

### Verification

Typecheck and lint clean. 73 unit/component tests. Playwright: **55 passed, 1 skipped** (the
pre-existing `AUTH-01` fixme) against the real v2 API and real Postgres — including the
rails driven by the backend's real ranking over seeded interactions, and every pre-existing
journey, which is what establishes the migration did not break current flows.
