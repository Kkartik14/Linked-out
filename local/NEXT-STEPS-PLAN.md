# LinkedOut next steps: reactions, left navigation, and live search

> Historical delivery plan. Consult `NEXT-STEPS-PLAN-1.1.4.md` and current runtime contracts for
> shipped behavior; this document may name features later retired by 1.1.4.

Status: product-approved in part; implementation must not begin until the blocking clarification
in section 1 is answered
Created: 2026-07-21
Source decisions: `local/PRODUCT-FLOW-QUESTIONS.md`
Product language: `local/CONTEXT.md`

## Goal

Deliver the accepted first-four product changes as one coherent release:

1. retire the meaningless “Builders Helped” metric;
2. present the existing fixed reactions as Slack-style chips without adding custom emoji;
3. add Search and Saved navigation below the existing viewer card while retaining People to
   Follow and header search; and
4. provide live, grouped search from the first character, with a full search centre that preserves
   both sidebars.

This plan includes product behavior, affected seams, sequencing, verification, and documentation.
It does not authorize work on the session inconsistency or the broader profile redesign.

## Accepted product behavior

### Reputation

- “Builders Helped” is removed as a LinkedOut product concept.
- It must disappear from the home viewer card, profile, shared metadata, and any other public UI.
- Do not replace it with another reputation number without a separate product decision.
- There are currently no users or production records that need historical preservation. Local test
  and seed data may be reset or regenerated as part of the eventual implementation, using the
  repository's existing guarded database procedures.

### Reactions and Saved

- Keep the existing fixed reaction catalog; do not build custom or uploaded emoji.
- A person may select multiple different reactions on one L.
- Only reaction types whose count is greater than zero appear as chips.
- With zero reactions, show only the add-reaction (`+`) control.
- With one to three used reaction types, show every used reaction chip.
- With more than three used reaction types, show two reaction chips followed by `+X`, where `X` is
  the number of hidden used reaction types.
- Existing chips are tappable: tapping joins or leaves that reaction.
- The add-reaction control opens the fixed catalog and indicates which reactions the viewer has
  already selected.
- Saved remains visually and behaviorally separate from expressive reactions and retains its
  existing bookmark control and `/saved` destination.
- A signed-out attempt to Save redirects to login and preserves the intended return destination.
- No custom-emoji storage, ownership, moderation, administration, or upload flow is in scope.

### Left rail

Desktop order is:

1. Viewer card, including the current signed-in, onboarding, and signed-out variants.
2. Search navigation option.
3. Saved navigation option.
4. People to Follow.

The header search remains. The new left-rail Search option opens the full search experience; it
does not remove or replace quick header search.

### Quick search

- Search reacts from the first character and updates for every changed query value.
- Typing in header search opens a dropdown over the current page/feed.
- Results are mixed but visibly grouped, not interleaved.
- The L group shows one top-matching L and a “See all Ls” action.
- The People group shows up to three matching people and a “See all People” action.
- Selecting the L opens its detail page; selecting a person opens their public profile.
- “See all Ls” opens the full search centre with the Ls tab selected and the same query.
- “See all People” opens the full search centre with the People tab selected and the same query.
- Search remains non-personalized. Existing visibility/privacy rules still apply.

### Full search centre

- The search view keeps both existing desktop sidebars.
- Only the centre column changes from feed mode to search mode.
- Entering through the left-rail Search option focuses the full search input.
- Before a query exists, the centre renders the normal feed rather than an empty search page.
- With a query, the centre renders the retained Ls and People tabs.
- The URL carries the query and selected tab when navigating through a “See all” action.

## 1. Blocking product clarification

Do not start reaction/backend removal work until this is answered:

> When asked whether the existing reaction labels, popularity weights, and notification rules
> should remain, Kartik answered: “remove them since we have 0 users and prod db has nothing; it is
> fine to remove from local as well.”

That can mean three different things:

1. Remove only `Builders Helped` and its stored counter/data.
2. Keep the four reaction identities and accessible names, but remove their popularity weights and
   reaction-generated notification behavior.
3. Remove the existing reaction identities/data themselves, which conflicts with the earlier
   accepted direction to use the existing fixed reactions.

The implementation agent must obtain an explicit choice. Visible labels may be omitted from compact
chips, but every fixed emoji still requires a stable product name for the picker, accessible name,
API identity, and assistive technology.

## 2. Delivery sequence

### Phase A — Lock contracts and interaction states

- Resolve the blocking reaction-semantics clarification.
- Resolve whether activating `+X` expands hidden chips inline or opens a popover.
- Resolve the mobile navigation equivalent because the current left rail is hidden below `lg`.
- Confirm whether the new left rail is shared only by Feed and Search or becomes a wider
  application shell.
- Confirm a short input debounce that still feels like every-character search and prevents stale
  responses from replacing newer queries.
- Capture the agreed desktop and mobile states before changing schemas or endpoints.

Acceptance gate: every reaction, navigation, and search state has one unambiguous expected outcome.

### Phase B — Remove “Builders Helped” coherently

Contract and metadata:

- Remove `buildersHelped` from the reputation schema/type and `REPUTATION_META`.
- Regenerate OpenAPI and update contract fixtures/snapshots.

Backend and database:

- Remove the `buildersHelped` field from user/profile/sidebar selects and mappers.
- Remove Helpful-driven reputation deltas from reaction plans and repositories.
- Remove deletion-time Helpful reputation accounting from L write/delete plans.
- Add a forward migration that drops the user column; do not silently edit already-applied
  migration history unless the repository's migration policy is explicitly changed.
- Reset/regenerate local test data only through the guarded database scripts.

Frontend:

- Remove the metric from the profile and viewer card.
- Decide what occupies the viewer card's second statistic slot: the accepted default is no
  replacement, so the card layout should adapt rather than invent another number.

Tests and documentation:

- Remove reputation assertions tied to Helpful.
- Add negative contract/UI assertions proving “Builders Helped” is absent.
- Update product, contract, architecture, seed policy, and E2E expectations together.

### Phase C — Build the Slack-style reaction presentation

- Derive visible expressive chips from non-zero counts in the fixed catalog order.
- Exclude Saved from expressive-chip overflow calculations.
- Render only `+` when no expressive reaction exists.
- Render one to three chips directly; when four are used, render the first two plus `+2`.
- Preserve multi-select, optimistic updates, per-L mutation serialization, cache reconciliation, and
  rollback behavior already present in `ReactionBar`.
- Ensure the picker exposes every fixed reaction with its accessible name and selected state.
- Define and implement the accepted `+X` reveal interaction.
- Keep the bookmark control in its current separate position and preserve Saved-list invalidation.
- Redirect a signed-out Save attempt to `/login?returnTo=<current L or saved destination>` rather
  than showing an action that cannot complete.
- Keep comment navigation independent from reaction overflow.

Acceptance gate:

- zero used reactions → only `+`;
- one, two, or three used types → all corresponding chips;
- four used types → first two chips plus `+2`;
- one viewer may select multiple types;
- Saved never enters the expressive-chip count;
- a guest Save attempt reaches login with a safe return path;
- optimistic updates remain consistent across duplicate instances of the same L.

### Phase D — Add left-rail Search and Saved

- Introduce a small navigation section directly below every ViewerCard variant.
- Keep People to Follow below the navigation section.
- Search opens the full search centre.
- Saved opens `/saved` for an authenticated viewer.
- Saved remains visible for a guest and routes through login with `/saved` as `returnTo`.
- Preserve the existing independent failure behavior: a sidebar data failure must not remove static
  Search/Saved navigation or take down the feed.
- Retain header search.
- Implement the separately accepted mobile equivalent after Phase A resolves it.

Acceptance gate: the left rail order and guest/authenticated destinations match the accepted flow,
and static navigation remains available when `/feed/sidebar` fails.

### Phase E — Build live grouped quick search

Frontend behavior:

- Treat the header query as controlled live state rather than submit-only state.
- Start after the first character and debounce requests without skipping query states visible to the
  user.
- Cancel or ignore superseded requests so a slow result for `h` cannot replace a newer result for
  `hilarious`.
- Fetch L and People previews concurrently using the same query.
- Request one L and three People records for the preview.
- Render separate labelled groups, loading state, no-results state, and per-group “See all” action.
- Support mouse, touch, Escape, arrow-key movement, Enter selection, and predictable focus return.
- Close the dropdown on destination navigation, outside interaction, or cleared input.

Backend search behavior:

- Keep search lexical and non-personalized; do not add embeddings or cosine similarity.
- Extend L search so an unfinished final token can match from the first character. Current
  `websearch_to_tsquery` whole-lexeme behavior does not satisfy this requirement.
- Preserve weighted title-over-story relevance, deterministic ordering, pagination, privacy, and
  post-hydration visibility checks.
- Keep People substring matching across username and name.
- Measure/query-plan the one-character case against representative data before accepting it; a
  first-character product experience must not accidentally require a full unbounded scan.
- Prefer extending existing typed search endpoints unless a combined preview endpoint materially
  simplifies consistent ranking/latency. Any new endpoint must use shared contracts and OpenAPI.

Acceptance gate: typing `h`, then continuing to `hilarious`, always leaves the UI showing results
for the newest value; the dropdown contains at most one L and three people and never leaks private
content.

### Phase F — Rebuild the full search page inside the shared shell

- Extract/reuse the feed's three-column shell so Feed and Search use identical rails and widths.
- Left-rail Search enters the full search centre and focuses its input.
- With an empty query, render the normal centre feed and feed controls.
- With a query, render Ls/People tabs and their infinite result lists.
- “See all” navigation preserves the query and selects the appropriate tab in the URL.
- Avoid duplicate header/full-search inputs fighting over query state; define which input owns focus
  in each mode.
- Preserve public-read failure rules and principal-scoped query keys.

Acceptance gate: Feed and Search retain the same rails; Back/Forward and refresh reproduce the
query/tab selected through “See all”; an empty full-search state is the normal feed, not a blank
panel.

### Phase G — Verification and documentation

- Contract tests: updated reputation shape and any search-query changes.
- API unit/integration tests: prefix behavior, ordering, privacy, pagination, and removal of Helpful
  reputation side effects.
- Frontend component tests: all reaction chip counts/overflow states, picker multi-select, Saved
  guest redirect, and left-rail ordering.
- Search component tests: first character, stale request race, grouped limits, empty groups, keyboard
  behavior, and “See all” URLs.
- E2E: authenticated and guest Saved paths; header dropdown to L/profile; full Search with rails;
  empty Search showing Feed; private/anonymous visibility invariants.
- Accessibility: named emoji controls, `aria-pressed`, labelled groups, combobox/listbox semantics,
  focus restoration, and non-color selected states.
- Run typecheck, lint, unit tests, safe integration tests, and browser E2E in both supported auth
  modes where applicable.
- Reconcile `local/CONTEXT.md`, product narrative, contracts, OpenAPI, architecture, runbook, and
  TODO only after runtime behavior ships.

## 3. Explicitly deferred

- Session inconsistency investigation (original point 5).
- Broader profile metrics, tabs, followers, and following redesign (original point 6), except for
  removing “Builders Helped.”
- Custom or user-uploaded emoji.
- Personalized search, embeddings, cosine similarity, recommendations, spelling correction, search
  history, and analytics.
- A broader Collections redesign.

## 4. Files and seams the implementation agent must re-check

- Product decisions: `local/PRODUCT-FLOW-QUESTIONS.md`, `local/CONTEXT.md`
- Contracts: `packages/contracts/src/enums.ts`, `reaction.ts`, `user.ts`, `search.ts`
- Database: `packages/db/prisma/schema.prisma` and migrations
- API reputation/reactions: `apps/api/src/modules/reactions/`, `apps/api/src/modules/ls/`
- API search: `apps/api/src/modules/search/`
- Viewer/profile composition: `apps/api/src/modules/users/`, `feed-sidebar/`
- Frontend reactions: `apps/web/src/components/l/reaction-bar.tsx`
- Frontend rails: `apps/web/src/components/feed/sidebar/`
- Frontend search: `apps/web/src/components/layout/header.tsx`,
  `apps/web/src/components/search/search-client.tsx`, `apps/web/src/app/search/page.tsx`
- Frontend Saved/session: `apps/web/src/app/saved/`, `apps/web/src/lib/session.ts`,
  `apps/web/src/components/session-provider.tsx`
- Existing acceptance coverage: `apps/web/e2e/feed.spec.ts`, `search-profile.spec.ts`,
  `auth-settings.spec.ts`, and `auth-handoff.spec.ts`

## 5. Completion definition

This body of work is complete only when:

- the blocking product questions are resolved and recorded;
- all accepted desktop and mobile flows are implemented;
- “Builders Helped” no longer exists in the runtime product contract or UI;
- reaction, Saved, and search behavior pass their acceptance cases;
- privacy and session boundaries have not regressed;
- generated contracts and narrative documents match runtime behavior; and
- no task from the explicitly deferred section has been pulled into scope accidentally.
