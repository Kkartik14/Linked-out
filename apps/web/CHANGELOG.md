# Changelog — @linkedout/web

Notable changes to the LinkedOut frontend. Newest first.

This file covers `apps/web` only. Its executable API contract is
`@linkedout/contracts`, with generated OpenAPI published by the backend at `/v1/openapi.json`.

## [Unreleased]

The web app now consumes the sole `/v1` API and root `@linkedout/contracts` export. API URLs,
browser fixtures, Playwright servers, examples, and contract imports were consolidated together;
the removed L persistence fields no longer appear in the real-Postgres browser seed.

A precision pass over the public contract also enforces the rules the repo already wrote down,
deletes what the cutover left behind, and pins invariants that were only being upheld by habit.

### Enforced

- **`eslint-config-next` carries no type-safety rules**, and the root config that has them
  scopes itself to `apps/api`/`packages/*` — so CLAUDE.md §1's "No `any`. No `unknown` as an
  escape hatch" applied to nothing here (`tsc --strict` rejects only *implicit* any). Added
  `typescript-eslint` with `no-explicit-any`, `consistent-type-assertions`
  (`objectLiteralTypeAssertions: never`) and `no-unnecessary-type-assertion`. The existing
  code was already clean; nothing now stops the next `as any` at the API boundary.
- **`pnpm lint` is `--max-warnings=0`.** `react-hooks/exhaustive-deps` and 24 other rules are
  warn-level: they ran in CI and could not fail it. (No violations existed — the gate is
  regression prevention.) Fixed in `package.json`, so CI and local dev cannot diverge.
- Vendored `components/ui/**` is exempt from `consistent-type-assertions` — `shadcn add`
  regenerates those files, and both patterns it emits (`createContext({} as T)`,
  `as React.CSSProperties` for CSS custom properties) are defensible.

### Fixed

- **The composer no longer chooses the privacy default.** Request bodies were typed
  `z.infer<typeof createLInputSchema>` — the schema's *output*, where `.default()` makes
  `type`/`visibility`/`isAnonymous` **required**. `createL({ title, story })` did not compile,
  so the composer hardcoded `visibility: "PUBLIC"`. Bodies are now `z.input<…>`; form defaults
  are read from the contract. This also unbroke `patchL(id, { resolvedAt: "<ISO>" })` — the
  shape §1 documents, which previously failed to typecheck.
- **`flattenComments` no longer re-sorts by ULID.** It ordered the list by comparing ids —
  depending on internals of a value the contract calls opaque (line 14), and on their case:
  `ulidSchema` accepts lowercase, which sorts after every uppercase id. Pages already arrive
  ordered. Dedupe now re-seats an id at its *last-seen* position, so a canonical page is
  authoritative for position as well as value and an optimistic append's guessed slot cannot
  outrank the server's real order (§4).
- **No request can hang forever.** `apiFetch` had no timeout, which quietly voided §2's "the
  sidebar fails independently of the centre feed": a request that never settles never
  rejects, so the rails' `.catch()` never fired and held the feed page open. Default 10s;
  `getFeedSidebar` takes 3s, being explicitly droppable.
- `/onboarding` checked `!session.user` but never `needsOnboarding`, handing an
  already-onboarded user the setup form.
- The profile page awaited `getProfile` then `getJourney` in series though neither depends on
  the other, billing every view for a needless round trip; and swallowed a rejected
  credential into an empty timeline instead of routing it through `public-read`.
- `(feed)/loading.tsx` was a one-column `max-w-2xl` skeleton standing in for a three-column
  `max-w-[80rem]` grid, so the route jumped sideways on resolve.
- `login` and `auth/callback` each carried a private copy of the OAuth error table, and the
  copies had **drifted**; `safeReturnTo` existed three times. Both now live in
  `src/lib/auth-entry.ts`.

### Removed

- **~35 lines of cookie-rotation machinery in `client.ts`** (`splitSetCookie`,
  `mergeCookieHeader`, `setCookiesFrom`, the `cookieHeader` plumbing) that could never run.
  Refresh is browser-gated, and in a browser `Set-Cookie` is a forbidden *response* header
  and `Cookie` a forbidden *request* header — userland can neither read a rotation nor
  replay it. Retry works because the browser's jar applies it and `credentials: "include"`
  sends it. Its test only passed by fabricating a `Response` with a working `getSetCookie()`
  via `as unknown as Response`, asserting a cookie header a real browser never sends.
- Dead exports: `formatMonthYear`, `getFollowers`/`getFollowing`, `queryKeys.comments.all`,
  the `ApiFetchInit` re-export, and the no-op `Principal` alias.

### Changed

- `FeedControls`' `canFollow` prop is now `canUseFollowingFeed`. `canFollow` is the contract's
  name for `SuggestedUser.viewer.canFollow` — a per-user permission §2 says not to recreate —
  and this only meant "is there a Following tab".
- `endpoints.ts`'s hand-written `FeedQuery` shadowed the contract's own `FeedQuery` one import
  path away, with `sort`/`cursor`/`limit` duplicated by hand. Now `FeedRequest extends
  Partial<ContractFeedQuery>`, keeping only the genuinely frontend-only `scope`.
- `(feed)/page.tsx` validates `?sort=` with `feedSortSchema.catch("latest")` instead of a
  hand-rolled `Set` plus two casts that asserted an unvalidated URL param into the enum
  *before* the check meant to justify it.

### Tests

- Mutation testing (44 injected bugs) scored **31 killed / 13 survived**. Closed the survivors
  that mattered: `public-read.ts` had **zero** unit coverage (its only tests need Postgres, so
  `pnpm test` could go green while §2's credential rule regressed); the sidebar's
  `refreshAfter - generatedAt` derivation was unpinned; `FeedSidebarLeft`'s failure-hides-rail
  had no test though `FeedSidebarRight`'s did; `truncate`/`initials` asserted only length and
  suffix, never output; comment/reply cursors were uncovered.
- `l-card.test.tsx` built a foreign shape with `} as LCardType` — a cast defeating the contract
  in the test meant to defend it. Now `Object.assign`, which widens honestly.

## [1.1.0] — 2026-07-17

Introduces the clean API contract and the feed's discovery rails. The contract is now the sole v1.

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
- **`src/lib/public-read.ts`** — the API rejects a presented-but-invalid credential with `401`
  on every optional-auth read instead of silently serving the guest view (contract §2), so
  a stale cookie now fails even a public page. The app cannot clear an httpOnly cookie from
  a Server Component (ADR 0001 §1.1), so it sends those viewers to `/login`: the one
  recoverable answer that neither pretends the credential is valid nor re-fetches as a
  guest, which would just move the forbidden downgrade into the client.
- The feed route is now three landmarks — two `complementary` rails around a `region`
  named "The Feed" — because the same L can appear in both the feed and a rail, and
  "the feed" has to be addressable.

### Changed

- **The app speaks the sole v1 API.** `NEXT_PUBLIC_API_BASE_URL` carries the `/v1` prefix; there is
  no second base URL and no per-call base override.
- Feed and search no longer send a category `filter`; their query keys lost that segment.
- The journey timeline renders `createdAt`; the API orders the journey by `(createdAt, id)`, so
  the label and ordering agree.
- The composer is five fields instead of nine.
- `mockUser.id` in the test harness is a real ULID. It was `"u_kartik"`, which fails any
  test that validates the user against the contract.

### Removed

The public contract deletes `category`, `company`, `tags` and `eventDate` from the L wire, so
the interface they backed is gone:

- feed and search **category filter chips**, and the `filter` search param — a saved URL
  carrying one still renders the full feed, the param is simply ignored
- the composer's **category, company, event-date and tags** fields, the whole `TagsInput`,
  and its `/tags/popular` autocomplete (that route does not exist in the public API)
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
pre-existing `AUTH-01` fixme) against the real API and real Postgres — including the
rails driven by the backend's real ranking over seeded interactions, and every pre-existing
journey, which is what establishes the migration did not break current flows.
