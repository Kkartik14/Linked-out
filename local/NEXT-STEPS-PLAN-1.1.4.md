# LinkedOut 1.1.4 next steps: search, social graph, rails, and profile cleanup

Status: Parts 6–8 implemented and release-verified on `fix/better-ux`
Created: 2026-07-23
Target release: 1.1.4
Product owner: Kartik
Runtime authority: `packages/contracts/src`, generated OpenAPI, then the narrative contract docs

## Goal

Deliver the eight requested product changes as independently owned workstreams that can be built in
separate branches without inventing duplicate contracts or backend routes.

The release should:

1. make `/search` the sole search-input owner while that route is open;
2. expose the existing follower and following directories in the frontend;
3. retain both discovery rails on Saved;
4. show Ls Shared, Followers, and Following in the viewer card;
5. retain only the left discovery rail on Settings and return to the profile after save;
6. remove the Journey timeline and Collections completely, and remove All from profile tabs;
7. reduce L types to L, Win, Story, Scar, Plot Twist, and Battle; and
8. move the current-status control out of Settings and give it a clearer product name.

This file is a delivery plan. Creating it does not change application behavior.

## Decisions and scope boundaries

### Search mode

- On `/search`, the full-page search input is the only search input.
- Hide both the desktop header combobox and mobile header search button on `/search`.
- Hide the header's textual Feed link on `/search`; keep the logo/home link and all unrelated
  header actions.
- An empty search query may continue showing feed controls and feed cards in the centre, but the
  embedded feed must not repeat the “The Feed” heading or its descriptive sentence.
- Search and Feed continue sharing the same left and right rails.

This interprets “remove the feed textual things in search mode” as removing only the embedded
feed introduction, not removing the empty-query feed itself.

### Followers and following

The backend already has the complete read contract:

- `GET /v1/users/:username/followers`
- `GET /v1/users/:username/following`
- both are optional-auth reads;
- both return `Paginated<UserSummary>`;
- both use deterministic ULID keyset pagination; and
- both have supporting composite indexes.

Therefore Part 2 is a frontend integration, not a new backend feature. Do not add replacement
routes, offset pagination, or a second follow-list schema.

### Complete-removal rule

When a product feature is removed in 1.1.4, it is removed vertically rather than hidden in one
screen. Current runtime code must not retain an unreachable contract, route, module, table,
counter, query, control, test fixture, or current product-document promise for it.

Therefore Collections are retired completely:

- delete the profile tab and every create/read/update/delete/add/remove collection screen and
  control;
- delete collection wire schemas, `LDetail.collections`, routes, OpenAPI entries, backend module,
  database models/tables/relations/indexes, `collectionsCreated`, seeds, tests, and current docs;
- do not preserve or export Collection data because the product has zero users and no production
  records requiring migration; and
- keep Saved as the existing private bookmark state backed by the `SAVED` reaction and
  `GET /me/saved`. Saved does not become or depend on a Collection record.

The Journey timeline is also retired completely: delete its profile UI, `JourneyNode` and query
contracts, `/users/:username/journey`, backend query/mapping code, tests, and current docs.

Already-applied migration files and historical changelog entries may still mention removed
features because they are append-only history. A new forward migration removes the current
database objects. They are not runtime or product interfaces.

The person's stored status is not the Journey timeline. It remains because Part 8 explicitly
keeps the capability, moves it, and renames its user-facing concept. Its stored enum values stay
stable unless a later product decision changes the actual choices.

### L-type retirement

The accepted public types after 1.1.4 are exactly:

| Wire value | Product label | Profile tab |
| --- | --- | --- |
| `L` | L | L |
| `WIN` | Win | Wins |
| `STORY` | Story | Stories |
| `SCAR` | Scar | Scars |
| `PLOT_TWIST` | Plot Twist | Plot Twists |
| `BATTLE` | Battle | Battles |

`CHECKPOINT` and `LESSON` are retired. The default migration assumption is to reclassify any
existing rows of either type as `L`, because `L` is the neutral type and does not invent a new
meaning for old content. No export or compatibility layer is required for the zero-user product.

Because Character Development is being retired rather than merely hidden in the composer, this
plan also retires its `Lessons Shared` reputation metric and stored counter completely.

## Team and branch map

| Part | Suggested branch | Primary ownership | Backend work |
| --- | --- | --- | --- |
| 1 | `feat/1.1.4-search-mode` | Search team | None |
| 2 | `feat/1.1.4-follow-lists` | Social graph UI team | Verification only |
| 3 | `feat/1.1.4-saved-rails` | Saved/discovery team | None |
| 4 | `feat/1.1.4-viewer-card-counts` | Viewer-card team | None |
| 5 | `feat/1.1.4-settings-navigation` | Settings/layout team | None |
| 6 | `feat/1.1.4-remove-journey-collections` | Removal team (full stack) | Required |
| 7 | `feat/1.1.4-l-types` | Contract/data team | Required |
| 8 | `feat/1.1.4-current-chapter` | Profile-status team | Contract verification only |

Each team owns its tests and supplies a release-note bullet with its handoff. A release integrator
owns the actual changelog edits, final version bumps, cross-branch conflict resolution, full-suite
execution, and the final contract-doc refresh.

---

## Part 1 — Search owns search mode

### Outcome

Opening Search from the left rail produces one search field, not an unsynchronized header field
plus a page field. Search mode also stops showing duplicate Feed copy.

### Frontend role

1. Teach `Header` that `/search` is a distinct mode.
2. On that route, omit `HeaderSearch`, omit the mobile search icon, and omit the textual Feed nav
   item. Do not hide the LinkedOut home logo, Share an L, notifications, theme, or user menu.
3. Give `FeedCentre` an explicit small interface for embedded presentation, such as
   `showIntroduction?: boolean` or `variant: "page" | "embedded"`. Do not make it inspect the
   current pathname internally.
4. In the empty-query Search state, render the existing feed controls/list through the embedded
   variant so “The Feed” and “Honest career stories…” are absent.
5. Keep current query debouncing, URL replacement, Back/Forward synchronization, principal-scoped
   keys, and left-rail focus behavior unchanged.

### Backend/contracts role

No backend or shared-contract change. Search ranking, prefix behavior, privacy, pagination, and
`GET /search` remain untouched.

### Responsible files

Primary edits:

- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/components/feed/feed-centre.tsx`
- `apps/web/src/app/search/page.tsx`
- `apps/web/src/components/search/header-search.test.tsx`
- `apps/web/src/components/search/search-client.test.tsx`

Possible new focused test:

- `apps/web/src/components/feed/feed-centre.test.tsx`

Reference-only unless a discovered defect requires change:

- `apps/web/src/components/search/search-client.tsx`
- `apps/web/src/components/search/header-search.tsx`
- `apps/web/src/components/feed/sidebar/sidebar-navigation.tsx`

### Acceptance checks

- `/search`, `/search?focus=1`, and `/search?q=x` have exactly one visible search input.
- Header quick search remains present everywhere it currently appears outside `/search`.
- The header Feed text is absent only on `/search`.
- Empty `/search` still shows feed controls and feed cards, without “The Feed” or its subtitle.
- A non-empty query still shows Ls/People results and never shows the embedded feed.
- Clearing a query returns to the embedded feed without remounting a competing search input.

---

## Part 2 — Followers and following directories

### Outcome

Follower and following counts become navigable, and each route shows the people represented by the
count with cursor pagination.

### Frontend role

1. Add typed client functions for the two existing routes. Return the shared
   `Paginated<UserSummary>` type directly.
2. Add separate principal-scoped infinite query keys for followers and following.
3. Build one shared list module parameterized by `followers | following`; keep fetching,
   skeleton, empty, retry, and pagination behavior behind that small interface.
4. Add public routes:
   - `/u/[username]/followers`
   - `/u/[username]/following`
5. Server-fetch the first page for fast first paint and pass it to the shared infinite list.
6. Render existing `UserSummaryCard` rows. A follow/unfollow button inside the directory is not
   required by this request because the current list response has no viewer-follow state.
7. Make both counts in `ProfileHeader` links to their corresponding routes. Preserve live count
   reconciliation after a follow/unfollow mutation.
8. Include a clear link back to `/u/[username]` and useful empty states (“No followers yet” and
   “Not following anyone yet”).

### Backend/contracts role

Verification only:

- keep `FollowsController` optional-auth guards;
- keep `Paginated<UserSummary>` and existing cursor validation;
- verify an unknown username remains `404 USER_NOT_FOUND`;
- verify presented invalid credentials remain `401`, never guest downgrade; and
- do not create migrations—the required keyset indexes already exist.

### Responsible files

Frontend edits:

- `apps/web/src/lib/api/endpoints.ts`
- `apps/web/src/lib/api/endpoints.test.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/lib/query-keys.test.ts`
- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/components/profile/profile-header.test.tsx`

Expected new frontend files:

- `apps/web/src/components/profile/follow-directory.tsx`
- `apps/web/src/components/profile/follow-directory.test.tsx`
- `apps/web/src/app/u/[username]/followers/page.tsx`
- `apps/web/src/app/u/[username]/following/page.tsx`

Backend verification/reference:

- `apps/api/src/modules/follows/follows.controller.ts`
- `apps/api/src/modules/follows/follows.service.ts`
- `apps/api/src/modules/follows/follows.repository.ts`
- `apps/api/src/common/contracts/api-route-contracts.ts`
- `apps/api/src/modules/meta/openapi.ts`
- `apps/api/test/integration/subparts/09-follows.cjs`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/migrations/20260717020000_follow_keyset_indexes/migration.sql`

### Acceptance checks

- Clicking Followers or Following from a profile opens the correct person's directory.
- Lists work for self, another user, and a signed-out visitor.
- The first page is server-rendered and subsequent pages use the existing opaque cursor.
- Empty, loading, exhausted, retry, 404, and invalid-credential states are intentional.
- Duplicate display names do not affect list keys; `UserSummary.id` remains the row identity.

---

## Part 3 — Keep both discovery rails on Saved

### Outcome

`/saved` uses the same three-column desktop discovery frame as Feed and Search: viewer/navigation/
people on the left, Saved in the centre, and Top Ls/L of the day on the right.

### Frontend role

1. Keep the current authentication gate before rendering Saved.
2. Fetch `getFeedSidebar()` as ancillary page data after the viewer is authorized.
3. Preserve independent rail failure: a failed sidebar request must not prevent Saved from
   rendering.
4. Wrap the Saved heading/list in `FeedShell` with `labelledBy="saved-heading"`.
5. Preserve the current narrow centre layout, infinite Saved query, bookmark invalidation, empty
   state, and mobile behavior (rails remain hidden at existing breakpoints).

### Backend/contracts role

No backend change. Reuse `GET /feed/sidebar` and `GET /me/saved`; do not create a Saved-specific
sidebar endpoint.

### Responsible files

Primary edits:

- `apps/web/src/app/saved/page.tsx`

Tests to add or update:

- `apps/web/src/components/saved-list.test.tsx` (new if the team adds list coverage)
- a Saved page/layout test under `apps/web/src/app/saved/` or a focused FeedShell composition test

Reference-only:

- `apps/web/src/components/saved-list.tsx`
- `apps/web/src/components/feed/feed-shell.tsx`
- `apps/web/src/components/feed/sidebar/feed-sidebar.tsx`
- `apps/web/src/lib/api/endpoints.ts`

### Acceptance checks

- Authenticated desktop Saved shows both rails in the same order and widths as Feed.
- Left Search and Saved navigation remains usable; Saved is marked current.
- Right Top Ls and L of the day remain independently recoverable.
- A sidebar timeout/error does not remove the Saved list or convert it to an error page.
- Signed-out access still goes through the existing safe `/login?returnTo=%2Fsaved` flow.

---

## Part 4 — Three viewer-card metrics

### Outcome

The signed-in viewer card shows exactly Ls Shared, Followers, and Following instead of only Ls
Shared.

### Frontend role

1. Change the signed-in card's definition list to a stable three-column layout.
2. Use `profile.reputation.lsShared`, `profile.counts.followers`, and
   `profile.counts.following`; do not calculate counts from lists in the browser.
3. Keep compact-number formatting for all three values.
4. Link Followers and Following to the Part 2 routes. Ls Shared may link to the viewer's profile.
5. Retain the existing signed-out and onboarding card variants unchanged.
6. Preserve the card's status display, View profile action, and sidebar failure behavior.

### Backend/contracts role

No backend change. `FeedSidebarViewer.READY.profile` already embeds `UserProfile`, whose contract
contains both counts. The sidebar repository already selects both denormalized counters.

### Responsible files

Primary edits:

- `apps/web/src/components/feed/sidebar/viewer-card.tsx`
- `apps/web/src/components/feed/sidebar/feed-sidebar.test.tsx`

Reference-only:

- `packages/contracts/src/feed-sidebar.ts`
- `packages/contracts/src/user.ts`
- `apps/api/src/modules/feed-sidebar/feed-sidebar.service.ts`
- `apps/api/src/modules/feed-sidebar/feed-sidebar.repository.ts`

### Acceptance checks

- READY state shows the three requested metrics in the requested order.
- Zero, large, and changing values render without shifting the card outside its rail.
- Followers/Following destinations contain the viewer's username, not a cached suggestion's.
- Signed-out and onboarding cards do not expose fake zero metrics.
- The old test asserting that followers are absent is replaced by positive count/link coverage.

---

## Part 5 — Settings gets a left rail and save returns to profile

### Outcome

Profile editing has an obvious route back through the left rail, no right rail, and a successful
Save changes navigates directly to the edited profile.

### Frontend role

1. Extend `FeedShell` with a narrow explicit rail mode (`"both" | "left"`) rather than copying its
   grid markup into Settings.
2. In left-only mode, render `FeedSidebarLeft`, centre content, and no right-rail grid slot. Keep
   the centre width consistent at desktop sizes.
3. On Settings, authorize the viewer first, then load sidebar data independently. A sidebar failure
   must leave the settings form usable and retain static Search/Saved navigation.
4. Render Settings through the left-only shell.
5. Capture the `UserProfile` returned by `patchMe`; on success use
   `router.push(`/u/${updated.username}`)` and then refresh. Do not use `router.back()`, because a
   direct visit to Settings has no reliable profile page in browser history.
6. Keep the form on Settings when validation, upload, or network errors occur.
7. Disable duplicate submission while navigation is pending and retain accessible success/error
   feedback.

### Backend/contracts role

No backend change. `PATCH /users/me` already returns the complete updated `UserProfile`, including
the canonical username needed for the redirect.

### Responsible files

Primary edits:

- `apps/web/src/components/feed/feed-shell.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/components/settings/settings-form.tsx`

Expected tests:

- `apps/web/src/components/feed/feed-shell.test.tsx` (new)
- `apps/web/src/components/settings/settings-form.test.tsx` (new)

Reference-only:

- `apps/web/src/components/feed/sidebar/feed-sidebar.tsx`
- `apps/web/src/lib/session.ts`
- `apps/web/src/lib/api/endpoints.ts`

### Acceptance checks

- Desktop Settings shows the left rail and never mounts the right rail.
- Mobile Settings remains a normal single-column form.
- Successful Save changes goes to `/u/<updated username>`.
- A failed save remains in place and exposes the error.
- Direct navigation to `/settings` behaves the same as navigation from a profile.
- The left rail failing does not block editing or saving.

---

## Part 6 — Remove Journey and Collections completely

### Outcome

Journey timeline and Collections cease to exist as current product features at every seam. The
profile contains only one tab per accepted L type; it has no Journey, All, or Collections tab.
Saved remains the only bookmark destination and retains its current `SAVED` reaction model.

### Frontend role

1. Stop requesting Journey in the profile Server Component; load only `getProfile()`.
2. Remove Journey, All, and Collections triggers and panels from `ProfileTabs`.
3. Default the profile tab to `L` and render one type-filtered list per `meta.lType` value.
4. Remove frontend Journey types, endpoint wrappers, query keys, timeline rendering, and fixtures.
5. Remove all Collection types/imports, endpoint wrappers, mutation calls, query keys, routes,
   cards, dialogs, list/detail screens, create/rename/delete controls, and Add to collection UI.
6. Remove collection presentation and `SaveToCollectionButton` from `LDetailView`; Saved's
   separate bookmark control remains in `ReactionBar` and must not change behavior.
7. Remove dead collection-specific accessibility TODO/test expectations instead of leaving tests
   for controls that no longer exist.
8. Add negative navigation coverage proving removed collection URLs no longer resolve to a product
   page, while `/saved` continues to work.

### Backend/contracts role

Shared contract removal:

1. Delete `packages/contracts/src/collection.ts` and its barrel export.
2. Delete `collectionRefSchema`/`CollectionRef` and remove `collections` from `LDetail`.
3. Delete `journeyNodeSchema`/`JourneyNode` and `journeyQuerySchema`/`JourneyQuery`.
4. Remove every Collection/Journey schema registration and route from the canonical route registry
   and generated OpenAPI. Removed paths must return the normal `404 NOT_FOUND` envelope.
5. Remove `collectionsCreated` from `reputationSchema` and `REPUTATION_META`.

Backend implementation removal:

6. Delete the complete `apps/api/src/modules/collections` module and remove it from `AppModule`.
7. Remove the Journey handler/validation pipe from `UsersController` and the Journey methods,
   cursor parsing, repository query, mapper, and types from the L module.
8. Remove collection lookup/composition from L detail reads so an L detail requires no Collection
   query and returns no Collection field.
9. Remove collection error codes/factories that have no remaining caller.
10. Remove `collectionsCreated` from user/sidebar selects, mappers, seed reconstruction, and every
    profile fixture.

Database removal:

11. Add one forward migration that drops `CollectionL`, then `Collection`, then the User
    `collectionsCreated` column. No export/backfill is needed for the zero-user database.
12. Remove `Collection`, `CollectionL`, and their relations/index declarations from
    `schema.prisma`; remove their generated-type re-exports and ULID-extension references.
13. Remove Collection creation/reset/recount logic from the seed and integration harness.
14. Audit `L_authorId_createdAt_idx`: drop it in the same migration only if the remaining repository
    query shapes do not use it after Journey disappears. Do not remove the `authorId/id` profile
    pagination index.
15. Do not edit already-applied historical migrations. The new migration is the deletion event.

Test and documentation removal:

16. Delete Collection behavior/rank test suites rather than preserving tests for deleted behavior.
17. Split `14-journey-saved.cjs` into Saved-only coverage (or rename it) and delete every Journey
    assertion while retaining Saved privacy/pagination tests.
18. Remove Journey/Collection cases from anonymity, strict-contract, public-surface, query-plan,
    architecture, seed, and database-boundary tests.
19. Add negative public-surface assertions for all removed paths and schemas.
20. Remove current Journey/Collection product and contract promises from local docs. Historical
    changelog and applied-migration descriptions may remain labelled as history.

### Responsible files

Frontend edits:

- `apps/web/src/app/u/[username]/page.tsx`
- `apps/web/src/components/profile/profile-tabs.tsx`
- `apps/web/src/components/l/l-detail-view.tsx`
- `apps/web/src/lib/api/endpoints.ts`
- `apps/web/src/lib/api/endpoints.test.ts`
- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/lib/query-keys.test.ts`
- `apps/web/src/test/utils.tsx`

Frontend deletions:

- `apps/web/src/app/collections/[id]/page.tsx`
- `apps/web/src/components/collections/collection-detail-view.tsx`
- `apps/web/src/components/collections/create-collection-button.tsx`
- `apps/web/src/components/collections/save-to-collection-button.tsx`
- `apps/web/src/components/profile/collection-card.tsx`
- `apps/web/src/components/profile/journey-timeline.tsx`

Frontend tests to add/update:

- `apps/web/src/components/profile/profile-tabs.test.tsx` (new)
- affected L-detail, reaction/Saved, routing, endpoints, and query-key tests

Shared contracts/data edits:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/l.ts`
- `packages/contracts/src/feed.ts`
- `packages/contracts/src/reputation.ts`
- `packages/contracts/src/enums.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed.cjs`
- `packages/db/src/index.ts`
- `packages/db/src/ulid.ts`
- `packages/db/prisma/migrations/<new_1.1.4_remove_journey_collections>/migration.sql`

Shared contract deletion:

- `packages/contracts/src/collection.ts`

Backend edits:

- `apps/api/src/app.module.ts`
- `apps/api/src/common/contracts/api-route-contracts.ts`
- `apps/api/src/common/errors/app-exception.ts`
- `apps/api/src/modules/meta/openapi.ts`
- `apps/api/src/modules/users/users.controller.ts`
- `apps/api/src/modules/users/users.repository.ts`
- `apps/api/src/modules/users/users.mapper.ts`
- `apps/api/src/modules/feed-sidebar/feed-sidebar.repository.ts`
- `apps/api/src/modules/ls/ls.types.ts`
- `apps/api/src/modules/ls/ls.mapper.ts`
- `apps/api/src/modules/ls/ls.service.ts`
- `apps/api/src/modules/ls/ls.repository.ts`

Backend module deletion:

- `apps/api/src/modules/collections/collections.controller.ts`
- `apps/api/src/modules/collections/collections.mapper.ts`
- `apps/api/src/modules/collections/collections.module.ts`
- `apps/api/src/modules/collections/collections.repository.ts`
- `apps/api/src/modules/collections/collections.service.ts`

Backend test deletion/update:

- delete `apps/api/test/integration/subparts/10-collections.cjs`
- reduce/rename `apps/api/test/integration/subparts/14-journey-saved.cjs` to Saved-only coverage
- delete `apps/api/test/unit/collection-ranks.test.cjs`
- update `apps/api/test/integration/index.test.cjs` so its fail-closed inventory names only the
  remaining/renamed suites
- update `apps/api/test/README.md`
- update `apps/api/test/integration/_harness.cjs`
- update `apps/api/test/integration/subparts/17-anonymity.cjs`
- update `apps/api/test/integration/subparts/18-contract-invariants.cjs`
- update `apps/api/test/integration/subparts/22-public-api.cjs`
- update `apps/api/test/integration/subparts/27-keyset-query-plans.cjs`
- update `apps/api/test/unit/api-services.test.cjs`
- update `apps/api/test/unit/keyset-indexes.test.cjs`
- update `apps/api/test/unit/keyset-repository-shapes.test.cjs`
- update `apps/api/test/unit/public-contract.test.cjs`
- update `apps/api/test/unit/openapi-contract.test.cjs`
- update architecture/database/seed safety tests found by the final zero-reference audit

Current documentation to update during release integration:

- `local/CONTEXT.md`
- `local/product.md`
- `local/contract.md`
- `local/docs/api-contract-v1.md`
- `local/ARCHITECTURE.md`
- `local/TODO.md`
- `local/README.md`
- `local/claude.md`

### Acceptance checks

- The profile has exactly one tab for each accepted L type and no Journey, All, or Collections.
- The initial selected tab is L and calls `/users/:username/ls?type=L`.
- No current frontend bundle contains a Collection route, control, client function, query key, or
  shared type.
- `/users/:username/journey`, `/users/:username/collections`, `/collections`,
  `/collections/:id`, and `/collections/:id/ls/:lId` are absent from controllers, route contracts,
  and OpenAPI and return the standard 404 envelope.
- `LDetail` has no `collections` field, and L detail performs no collection query.
- `Collection`, `CollectionL`, and `collectionsCreated` are absent from the current Prisma schema
  and database after migration.
- `JourneyNode`, `JourneyQuery`, Collection schemas, and `collectionsCreated` are absent from the
  shared package's public exports.
- `/saved`, Saved bookmark mutations, cache invalidation, privacy, and pagination remain green.
- A repository-wide reference audit finds no current implementation references; only append-only
  historical migrations/changelogs may retain the old words.

---

## Part 7 — Retire Checkpoint and Character Development

### Outcome

The contract, database, metadata, composer, and profile agree on the six remaining L types.
`CHECKPOINT` and `LESSON` cannot be created through a stale client.

### Frontend role

1. Consume the reduced `meta.lType` array; do not hard-code a second frontend allowlist.
2. Verify the composer shows exactly the six accepted types for create and edit.
3. Verify profile tabs from Part 6 show the same six values and labels.
4. Remove `lessonsShared` from frontend fixtures and any presentation after the shared reputation
   contract removes it.

### Backend/contracts role

1. Remove `CHECKPOINT` and `LESSON` from `lTypeSchema` and `L_TYPE_META`.
2. Remove `lessonsShared` from `reputationSchema`, `REPUTATION_META`, profile/sidebar selects,
   mappers, write-plan types, write plans, and seed reconstruction. A metric tied to a type that no
   longer exists must not remain publicly visible.
3. Add a forward-only Prisma migration that:
   - updates existing `CHECKPOINT` and `LESSON` L rows to `L`;
   - drops the obsolete `lessonsShared` column;
   - replaces the PostgreSQL `LType` enum with the six-value enum safely; and
   - preserves all L ids, timestamps, visibility, reactions, comments, and `lsShared` totals.
4. Update `schema.prisma` and regenerate the Prisma client through the repository's normal build
   flow; do not edit applied migration history.
5. Update seed data so it never creates a retired type.
6. Add negative API tests proving create/update reject both retired wire values.
7. Update metadata, public-contract, write-plan, user-profile, OpenAPI, and migration safety tests.

### Responsible files

Shared contracts/data:

- `packages/contracts/src/enums.ts`
- `packages/contracts/src/reputation.ts`
- `packages/db/prisma/schema.prisma`
- `packages/db/prisma/seed.cjs`
- `packages/db/prisma/migrations/<new_1.1.4_l_type_cleanup>/migration.sql`

Backend implementation:

- `apps/api/src/modules/ls/ls.types.ts`
- `apps/api/src/modules/ls/ls.write-plan.ts`
- `apps/api/src/modules/ls/ls.repository.ts`
- `apps/api/src/modules/users/users.repository.ts`
- `apps/api/src/modules/users/users.mapper.ts`
- `apps/api/src/modules/feed-sidebar/feed-sidebar.repository.ts`
- `apps/api/src/modules/meta/meta.service.ts`
- `apps/api/src/modules/meta/openapi.ts`

Backend tests:

- `apps/api/test/integration/subparts/01-meta.cjs`
- `apps/api/test/integration/subparts/03-ls-create.cjs`
- `apps/api/test/integration/subparts/05-ls-update-delete.cjs`
- `apps/api/test/integration/subparts/13-users-profile.cjs`
- `apps/api/test/unit/domain-write-plans.test.cjs`
- `apps/api/test/unit/api-services.test.cjs`
- `apps/api/test/unit/public-contract.test.cjs`
- `apps/api/test/unit/openapi-contract.test.cjs`
- database migration/safety tests selected by the migration owner

Frontend verification/fixtures:

- `apps/web/src/components/l/l-composer.tsx`
- `apps/web/src/components/profile/profile-tabs.tsx`
- `apps/web/src/test/utils.tsx`
- affected component test fixtures containing `lessonsShared`

### Acceptance checks

- `GET /meta/enums` returns exactly the six accepted L types in the accepted order.
- Create and update return `400 VALIDATION_ERROR` for `CHECKPOINT` and `LESSON`.
- The composer and profile expose no Checkpoint, Lesson, or Character Development copy.
- Existing retired-type rows become `L` without losing associated records.
- `lessonsShared` disappears from runtime schemas, OpenAPI, profiles, sidebars, and database.
- A full migration on representative data succeeds both from the previous schema and on a fresh
  database.

---

## Part 8 — Rename and relocate Journey status

### Naming decision

Recommended product term: **Current chapter**.

Why: it describes a person's present career context without sounding like an availability flag or
a workflow state, and it fits values such as Interviewing, Building, Recovering, and Taking a
Break.

Approved product term (Kartik, 2026-07-23): **Current chapter**.

Alternatives considered before approval:

1. **Current chapter** — recommended; warm and broad enough for every existing value.
2. **Current mode** — concise and action-oriented, but slightly mechanical.
3. **Where I'm at** — conversational, but less compact in buttons and accessibility labels.

The term is defined in `local/CONTEXT.md` as the person's self-declared current career context;
“Journey status” is retained only as an internal wire/type name.

### Approved placement

Kartik approved the self-profile action stack in `ProfileHeader`: Edit profile first, then Current
chapter immediately below it. The control is not duplicated in the global viewer card or Settings.

### Frontend role

1. Build one focused status-control module that owns its picker/dialog, mutation, pending state,
   error feedback, and cache reconciliation.
2. Show it only on the viewer's own profile, directly under Edit profile in the chosen placement.
3. Use existing `meta.journeyStatus` values, labels, and dots; do not hard-code enum options.
4. Submit only `{ status }` through `patchMe`, including `null` for clearing.
5. On success, update/invalidate the self-profile and feed-sidebar caches and refresh the server
   session snapshot so header, avatar dots, and viewer card converge.
6. Remove the status field and status mutation payload from `SettingsForm`; Settings continues to
   edit avatar, name, and bio.
7. Replace user-facing “Journey status” with the selected term. Internal TypeScript and Prisma
   names may remain `JourneyStatus` in 1.1.4 to keep the wire stable.

### Backend/contracts role

No wire or database change. Verify that `PATCH /users/me` with `{ status: JourneyStatus | null }`
remains the sole mutation seam. Do not add a special status endpoint.

If Kartik later changes the set or meaning of the enum values, that is a separate contract task;
renaming the concept alone does not justify it.

### Responsible files

Primary edits:

- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/components/profile/profile-header.test.tsx`
- `apps/web/src/components/settings/settings-form.tsx`

Expected new module:

- `apps/web/src/components/profile/current-chapter-control.tsx` (rename to the accepted term)
- `apps/web/src/components/profile/current-chapter-control.test.tsx`

Cache/reference files:

- `apps/web/src/lib/query-keys.ts`
- `apps/web/src/components/session-provider.tsx`
- `apps/web/src/components/feed/sidebar/viewer-card.tsx`
- `apps/web/src/components/meta-provider.tsx`
- `packages/contracts/src/enums.ts`
- `packages/contracts/src/user.ts`
- `apps/api/test/integration/subparts/13-users-profile.cjs`

Documentation after the term is approved:

- `local/CONTEXT.md`
- `local/product.md`
- `local/contract.md`
- `local/docs/api-contract-v1.md`

### Acceptance checks

- A self-profile shows Edit profile followed immediately by Set/Update `<accepted term>`.
- Other people's profiles never show the control.
- The picker supports every current enum value plus clearing the value.
- A successful change updates the profile badge, avatar dot, header/user menu, and viewer card
  without requiring a hard reload.
- Settings no longer contains the status selector.
- The public wire and persisted enum values remain backward compatible.

---

## Cross-branch coordination

### Expected file collisions

| Files/seam | Parts | Resolution |
| --- | --- | --- |
| `profile-header.tsx` and its test | 2 and 8 | Merge Part 2 first; Part 8 rebases and adds the self-status action without rewriting network links. |
| `settings-form.tsx` | 5 and 8 | Merge Part 5 first; Part 8 removes the status field while preserving Part 5's redirect behavior. |
| `profile-tabs.tsx` | 6 and 7 | Merge Part 6 first; Part 7 should get six tabs through reduced metadata, not a second hard-coded filter. |
| Reputation contract, User/Profile selects, Prisma User, seed, and fixtures | 4, 6, 7, and 8 | Part 6 removes `collectionsCreated`; Part 7 rebases and removes `lessonsShared`; all UI branches then rebase on the final shared shape. |
| L contract/module/OpenAPI | 6 and 7 | Part 6 removes Journey/Collection surfaces first; Part 7 rebases and removes retired L types without restoring deleted schemas or queries. |
| `FeedShell` | 3 and 5 | Part 3 consumes the current both-rail default; Part 5 alone adds the left-only interface. |

### Recommended merge order

1. Parts 1, 2, 3, and 4 may proceed in parallel.
2. Merge Part 5 after Part 3 or rebase it once Part 3 is present.
3. Merge Part 6 as the complete Journey/Collections contract and database deletion.
4. Rebase and merge Part 7 afterward as the second coordinated contract/database cutover. Parts 6
   and 7 must not independently author incompatible final Prisma or reputation shapes.
5. Merge Part 8 after Parts 2 and 5 and after Kartik approves the product term and exact placement.
6. Run release integration and documentation refresh only after every branch has rebased on the
   same contract shape.

## Release-wide verification

Every branch runs its focused tests. The release integrator then runs, from the correct workspace:

- backend build, typecheck, lint, and unit tests;
- real-Postgres API integration tests, including follows, profiles, L create/update, metadata,
  public contract, and query plans;
- web tests, typecheck, lint, and production build;
- legacy and handoff browser acceptance suites for the affected navigation/authenticated routes;
- `git diff --check`; and
- a manual responsive pass at mobile, `lg`, and `xl` widths.

Manual release scenarios:

1. Enter Search from the left rail, type and clear a query, use Back/Forward, and verify one input.
2. Open followers/following for self, another user, guest, zero results, and multiple pages.
3. Open Saved with healthy and failed sidebar requests.
4. Inspect the viewer card with zero and large counts.
5. Save Settings from direct navigation and from a profile.
6. Verify every removed Journey/Collection frontend and API route is gone while Saved still works.
7. Inspect all six profile tabs and create/edit each accepted L type.
8. Attempt retired type values directly against create and update.
9. Change and clear the accepted current-status concept and confirm every cached surface converges.

## Release integration and documentation ownership

The final integrator, not an individual feature branch, owns:

- updating root/API/web/internal package versions to 1.1.4 and both lockfiles where required;
- updating OpenAPI `info.version` to 1.1.4;
- adding 1.1.4 entries to `apps/api/CHANGELOG.md` and `apps/web/CHANGELOG.md`;
- updating `local/README.md`, `local/TODO.md`, `local/product.md`, `local/contract.md`,
  `local/ARCHITECTURE.md`, and `local/docs/api-contract-v1.md` to describe shipped behavior and
  delete current Journey/Collection promises;
- adding the accepted replacement for Journey status to `local/CONTEXT.md`; and
- removing stale plan language that still says header search must remain on the full Search route.

Do not mark 1.1.4 complete while Journey/Collection current interfaces remain, or while runtime
contracts, generated OpenAPI, frontend metadata, the database schema, or narrative docs disagree
about the six L types and reduced reputation shape.

## Parts 6–8 implementation record

Completed on `fix/better-ux` on 2026-07-23:

- removed Journey and Collections from frontend routes/components, client contracts, shared
  contracts, OpenAPI, backend modules, current Prisma schema, seeds, fixtures, and current docs;
- retained explicit negative API/browser coverage proving the retired routes return the standard
  404 behavior while Saved remains functional;
- reduced L types to the approved six values across schema, metadata, create/edit/profile UI, API,
  OpenAPI, and PostgreSQL;
- added a CI upgrade rehearsal that builds the previous schema in an isolated disposable database,
  seeds representative `CHECKPOINT`/`LESSON` rows with relations and counters, applies both forward
  migrations, and proves the rows become `L` without losing identity, timestamps, reactions,
  comments, or active reputation data;
- shipped the approved **Current chapter** control below Edit profile on self-profiles, with no
  control on other profiles or in Settings. It uses the existing `{ status }` profile mutation,
  supports clearing, replaces the exact profile cache, invalidates other principal-owned views,
  and refreshes the server session snapshot; and
- refreshed API/web release notes under Unreleased. Package and generated OpenAPI version bumps
  remain intentionally deferred to the final integrator after Parts 1–5 land, as required by the
  merge-order section above.

Final verification at the branch tip:

- root and web typecheck/lint: passed;
- backend build and production Next builds in both legacy and handoff modes: passed;
- API unit: 174/174 passed across 32 files;
- web unit/component: 306/306 passed across 46 files;
- real-Postgres HTTP integration: 359/359 passed across 30 suites;
- legacy Playwright: 63/63 passed, including Current chapter set/clear persistence; and
- handoff Playwright: 12/12 passed.

The local runner used Node 26.4.0 and emitted the repository's expected engine warning because CI
pins Node 22.x; no verification command failed.
