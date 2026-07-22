# LinkedOut product-flow questions and decision backlog

> Historical discovery snapshot from before 1.1.4. The shipped 1.1.4 decisions supersede this
> document wherever it describes Journey, Collections, profile tabs, L types, or reputation.

Status: product discovery; no implementation is authorized by this document
Opened: 2026-07-21
Owner: product decisions must come from Kartik
Scope: the six feed, search, session, reaction, navigation, and profile questions raised on
2026-07-21, plus later questions added to this same discovery pass

## How another agent must use this document

This is a decision document and a backlog of open product questions, not an implementation plan.
Do not convert an option below into code merely because it is technically possible or because one
option sounds preferable. First record Kartik's answers in **Accepted decisions**, reconcile any
affected product terminology, and only then prepare an implementation plan.

The current runtime remains authoritative while these questions are open. When documentation and
code differ, use the authority order in `local/README.md`. Relevant runtime evidence is linked
under each topic so a future agent can re-check it instead of relying on this summary.

## Product guardrails stated in this discussion

- Work product-first: agree on the user flow before going into schemas, APIs, ranking, or UI code.
- Do not overengineer search or introduce personalization/profile-based search ranking now.
- Search is important, but this phase should define the experience rather than build a search
  platform.
- The search experience should begin responding from the user's first input instead of requiring a
  completed query and Enter.
- Search should have its own central experience while preserving the surrounding left and right
  rails.
- Saved should be a simple, first-class destination similar to X/Twitter Bookmarks.
- Reactions may move toward a Slack-like model in which reactions already used on an L remain as
  tappable chips and other reactions are available through an add control.
- More product questions are expected. Keep this document open until Kartik explicitly closes the
  discovery pass.

## Current page model

The current home page is a three-column desktop grid:

1. Left rail: the viewer card followed by People to Follow.
2. Centre: feed heading, feed controls, and the infinite feed.
3. Right rail: Top Ls and L of the Day.

The right rail disappears below `xl`; both rails disappear below `lg`. Search currently uses a
separate narrow centre-only page, so the statement that search preserves both rails describes the
desired flow, not the current flow.

Runtime references:

- `apps/web/src/app/(feed)/page.tsx`
- `apps/web/src/components/feed/sidebar/feed-sidebar.tsx`
- `apps/web/src/components/feed/sidebar/viewer-card.tsx`
- `apps/web/src/app/search/page.tsx`

---

## 1. “Builders Helped” in the home-page viewer card

**Decision status: accepted on 2026-07-21 — remove this product metric.**

### What the user saw

The label was described as “builders held.” The actual runtime label is **Builders Helped**. It is
shown beside **Ls Shared** in the signed-in viewer card on the left side of the feed and is also one
of five reputation figures on a public profile.

### What it means today

`buildersHelped` is a denormalized counter stored on the author. It increases by one when another
user adds a `HELPFUL` reaction to one of the author's Ls. It decreases when that reaction is
removed, and deleting an L removes the qualifying contribution represented by that L.

Consequences of the current definition:

- It counts active helpful reactions, not unique people.
- One person can contribute more than one point by reacting helpfully to multiple Ls.
- The author's own helpful reaction does not count.
- It is not an irreversible lifetime total; it can go down.
- It is a reaction-derived proxy for usefulness. It does not establish that a real-world person was
  actually helped.

### Why it was created

The original product document says the platform should avoid emphasizing follower counts and
instead surface usefulness. The left viewer card deliberately picked `Ls Shared` and
`Builders Helped` as its two headline figures to answer “has my writing helped anyone?”

### Product problem to resolve

The wording sounds stronger and more human than the underlying event. “Builders Helped” implies
unique people and possibly durable real-world impact, while the implementation measures current
helpful-reaction rows.

### Decisions required

Resolved: “Builders Helped” should not appear on the home viewer card, profile, or another product
surface. The concept is not meaningful enough to rename or redefine. The later implementation plan
must remove it coherently from product metadata and UI and decide the safe data/contract cleanup;
do not replace it with another reputation metric without a new product decision.

### Runtime evidence

- `packages/contracts/src/enums.ts` (`REPUTATION_META`)
- `apps/web/src/components/feed/sidebar/viewer-card.tsx`
- `apps/api/src/modules/reactions/reactions.plan.ts`
- `apps/api/src/modules/ls/ls.write-plan.ts`
- `packages/db/prisma/schema.prisma` (`User.buildersHelped`)

---

## 2. Replace the always-visible reaction row with a Slack-like reaction flow

**Decision status: core interaction accepted on 2026-07-21.**

### What exists today

Every L always shows four expressive controls:

- 💔 Been There
- 💡 Helpful
- 🔥 Respect
- 😂 Pain

Saved uses the same backend `Reaction` model but is rendered separately as a bookmark control.
Each user may add at most one reaction of each type to an L and may use multiple different reaction
types on the same L. The UI optimistically updates shared cached counts, and mutations for the same
L are serialized.

The backend currently treats these identifiers as a closed enum. Each type has its own denormalized
counter. `BEEN_THERE`, `HELPFUL`, `RESPECT`, and `PAIN` contribute different lifetime popularity
weights; Saved has zero ranking weight. Only Been There and Helpful generate reaction
notifications. Helpful from somebody other than the author also changes `buildersHelped`.

One noteworthy inconsistency already exists: Saved is described in backend comments as private
library intent, but the aggregate saved count is included in public L responses and displayed on
cards.

### Desired direction stated by Kartik

Move toward Slack-style reaction chips:

- An L does not need to show every possible emoji all the time.
- Once somebody uses a reaction, that reaction appears under the L with its count.
- Other users can add or remove themselves by tapping the existing chip.
- A separate add-reaction control opens the available catalog.
- Custom emoji was considered but is excluded from this scope; the catalog remains platform-owned
  and fixed.

### Product boundary

This is a Slack-like presentation of LinkedOut's existing reaction model, not Slack-style custom
emoji infrastructure. That boundary avoids introducing emoji ownership, uploads, moderation, or a
workspace/server concept.

### Decisions required

Accepted:

- Use the existing fixed reaction catalog; do not add custom or user-uploaded emoji in this scope.
- Present reactions in the Slack style: reactions already used on an L appear as tappable chips,
  and another reaction is chosen through an add-reaction control.
- A user may add multiple different reactions to the same L.
- Keep Saved working and presented as it is today; it is not part of this reaction redesign.
- When an L has no reactions, show only the add-reaction (`+`) control. Do not pre-populate the row
  with suggested or empty reaction buttons.

Still open within this interaction:

- Accepted: show all reaction chips when at most three distinct expressive reactions have non-zero
  counts. If more than three exist, show the first two and a `+X` overflow control representing the
  hidden reaction types.
- Blocking clarification: Kartik answered “remove them since we have 0 users and prod db has
  nothing; it is fine to remove from local as well” when asked whether the current reaction labels,
  popularity weights, and notification rules should remain. It is not yet clear whether “them”
  means the rejected `Builders Helped` field/data, the legacy reaction ranking/notification
  behavior, or the fixed reaction identities themselves. Do not infer one of these meanings.
- Still open: what does activating `+X` do—expand the hidden chips inline or open an overflow
  popover?

### Deferred implementation consequences; do not act yet

After the flow is accepted, a technical plan must explicitly cover reaction visibility, existing
counter/ranking/notification behavior, metadata, accessible names, responsive overflow, and
regression coverage. No custom-emoji schema or asset system belongs in this work.

### Runtime evidence

- `packages/contracts/src/enums.ts` (`ReactionType` and `REACTION_TYPE_META`)
- `packages/contracts/src/reaction.ts`
- `apps/web/src/components/l/reaction-bar.tsx`
- `apps/api/src/modules/reactions/`
- `apps/api/src/modules/ls/popularity.policy.ts`
- `apps/api/src/modules/notifications/notification-events.ts`
- `packages/db/prisma/schema.prisma` (`Reaction` and L reaction counters)

---

## 3. Make Search and Saved the simple left-side navigation

**Decision status: placement direction partially accepted on 2026-07-21.**

### What exists today

- The feed's left rail contains a viewer/profile card and People to Follow.
- Search is an input in the global header on `sm` and larger screens.
- Saved exists as a protected `/saved` page and is reachable from the authenticated user menu.
- The bookmark button on every L toggles the `SAVED` reaction.
- The Saved page already returns the viewer's saved Ls newest-save first.

### Desired direction stated by Kartik

The left side should be simpler and should expose only the essential navigation, specifically
Search and Saved. Saved should feel like the straightforward Bookmarks/Saved destination on X,
not a collection system or a set of nested sections.

### Decisions required

- Accepted: keep the viewer card.
- Accepted: add Search and Saved below the viewer card.
- Accepted: keep the header search as a second entry point.
- Accepted: keep People to Follow below Search and Saved.
- Accepted: Saved remains visible to a signed-out visitor; tapping either the left-rail Saved entry
  or an L's Save control redirects to login with the intended destination preserved.
- Does the left navigation appear on profile/search/detail pages as a persistent application shell,
  or only on feed/search?
- What is the mobile equivalent, because the current left rail is hidden below `lg`?
- Are Collections intentionally separate from Saved? Current behavior says yes: Saved is a private
  personal list, while Collections are named, ordered profile objects containing only the owner's
  own Ls.

### Runtime evidence

- `apps/web/src/components/feed/sidebar/feed-sidebar.tsx`
- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/components/layout/user-menu.tsx`
- `apps/web/src/app/saved/page.tsx`
- `apps/web/src/components/saved-list.tsx`
- `apps/api/src/modules/ls/ls.repository.ts` (`getSaved` ordering)

---

## 4. Search interaction and result-page flow

**Decision status: live-search and initial grouping accepted on 2026-07-21; remaining navigation
details are open.**

### What exists today

Header search does nothing until the form is submitted. It then navigates to `/search?q=...`.
The full search page has a second input and two choices, **Ls** and **People**. Search also waits for
form submission there. With no query, it displays an instructional empty state. The page does not
render the feed sidebars.

The two backend modes differ:

- L search uses PostgreSQL full-text search with `websearch_to_tsquery('english', q)`, weighted so
  title matches rank above story matches. It ranks by textual relevance and then ID. It is not
  semantic/vector search and does not perform prefix completion for an unfinished final word.
- People search performs case-insensitive substring matching across username and name, backed by a
  trigram expression index, and orders by username. It is not profile-personalized.

Both modes apply the existing privacy model. No cosine-similarity/vector infrastructure exists.

### Desired direction stated by Kartik

- Search should react from the first word/input rather than requiring Enter.
- Search should remain deliberately non-personalized and should not become a major search-
  engineering project.
- Entering search should create a distinct search screen/state.
- The left and right sidebars should stay in place; the centre changes from feed to search.
- Before there is an active query, the centre can continue showing the feed instead of a blank
  page.
- Search may open as a box/dropdown that helps the user choose between people and content.

### Ambiguities that must be resolved before design

“From the first word itself” could mean either:

1. issue results after every keystroke starting at the first character, with debounce; or
2. wait until the first complete word is present, then update continuously.

“A different screen” and “a dropdown box” may describe two stages—quick suggestions from the
global search control followed by a full centre-column result view—or one centre-column search
mode. The intended stages need to be explicit.

### Decisions required

- Accepted: live search begins with the first character and updates after every character typed.
- Accepted: the initial search response mixes result types but presents them as explicit groups.
- Accepted: the leading result is the top-matching L, followed by a People section.
- Accepted: expanding the People section opens the full People tab/view for the same query.
- Accepted: typing in the header search opens a live dropdown over the existing feed.
- Accepted: the dropdown shows one top-matching L, then up to three matching people.
- Accepted: selecting a preview opens that L or person's profile.
- Accepted: “See all People” opens the full search centre with People selected and the same query.
- Accepted: the L group also has “See all Ls,” which opens the full search centre with Ls selected
  and the same query.
- Accepted: the Search option in the left rail opens the full search centre while both rails remain.
- Accepted: before the full search centre has a query, its centre continues to show the normal feed.
- Accepted: retain Ls and People tabs in the full search centre as the expanded destinations.
- Should the typed query live in the URL continuously so Back, refresh, and sharing preserve it?
- What should keyboard behavior be for Escape, arrow keys, Enter, and returning focus?
- Is simple lexical/prefix matching acceptable for the first version, explicitly deferring vector
  or cosine similarity?

### Non-goals unless separately approved

- Personalized ranking based on a user's profile, graph, or history.
- A recommendation engine disguised as search.
- Embeddings/vector infrastructure merely to make the UI live.
- Search analytics, query suggestions, spelling correction, or a search-history platform.

### Runtime evidence

- `apps/web/src/components/layout/header.tsx`
- `apps/web/src/app/search/page.tsx`
- `apps/web/src/components/search/search-client.tsx`
- `apps/api/src/modules/search/search.repository.ts`
- `apps/api/src/modules/search/search.service.ts`
- `packages/contracts/src/search.ts`

---

## 5. Critical session inconsistency: logged-out UI alongside profile access

**Decision status: deliberately deferred on 2026-07-21.**

### Reported symptom

The observed experience was internally contradictory:

- the home left rail asked the visitor to log in;
- a profile could still be opened and appeared to be “my profile”;
- Settings/avatar editing asked for login again.

This must be resolved before treating new authenticated flows as reliable.

### What is expected versus what would be a bug

Public profile access is intentional. A logged-out visitor may open `/u/:username` and see public
profile information, reputation, public Ls, journey items, and public collections. That alone does
not mean the application believes the visitor is that user.

Settings and avatar editing are intentionally protected and must redirect a genuine guest or a
rejected/expired credential to login.

A confirmed consistency bug exists if any of these are visible at the same time as a login prompt:

- the header's authenticated avatar/account menu;
- **Edit profile** rather than Follow on that profile;
- the profile response marks `viewer.isSelf = true`;
- private/followers-only content visible only to the owner;
- a successful authenticated mutation.

### The request paths involved

These surfaces do not call different backend deployments in the current configuration, but they do
resolve identity through separate requests:

- Root layout/header: `GET /auth/me` through `getSession()`.
- Home left rail: `GET /feed/sidebar`, whose response has `SIGNED_OUT`,
  `ONBOARDING_REQUIRED`, or `READY`.
- Public profile: `GET /users/:username`, optionally authenticated; `viewer.isSelf` comes from the
  backend.
- Settings: `GET /auth/me`, then `requireViewer()` before rendering.

All use the central `apiFetch` and the configured API base. In the checked local configuration the
application is in legacy cookie mode and browser calls target `http://localhost:4000/v1`.

### Existing consistency protections

- Session state distinguishes authenticated, clean guest, rejected credential, and unavailable
  identity; an outage must not be presented as logout.
- Cross-tab sign-in/sign-out invalidates and re-derives the root session.
- A back-forward-cache restore re-derives the session.
- Principal-scoped queries are removed when the principal changes.
- Protected routes redirect guests/rejected sessions; unavailable identity reaches an error
  boundary instead of a false login.
- Existing E2E tests separately cover public profiles, owner-only profile behavior, protected-route
  redirects, stale credentials, settings, and BFF session lifecycle.

### Diagnosis status

**Not reproduced in this planning session.** No in-app browser was attached, and the current test
suite does not assert all four surfaces in one scenario. Therefore this document does not assign a
root cause.

The minimum useful reproduction must capture:

1. the exact URL and whether the header showed Login or an account avatar;
2. the precise left-rail content;
3. how the profile was opened and whether it showed **Edit profile** or Follow;
4. whether private content was visible;
5. the Settings redirect URL;
6. whether a refresh changes the state;
7. whether this followed login, logout, tab switching, Back navigation, or token expiry;
8. the active session mode/environment.

A screenshot or screen recording with those transitions, or a HAR with cookies redacted, is enough
to establish the missing feedback loop. The later regression test should perform the exact
sequence and assert that header, sidebar, profile viewer state, and protected page all agree in
both supported auth modes.

### Decisions required after reproduction

- Confirm whether “I can see my profile” means a normal public profile or an owner-only state.
- Confirm the environment and action sequence.
- Decide the product presentation for public profiles viewed while signed out so public visibility
  cannot be mistaken for authentication.

### Runtime evidence

- `apps/web/src/app/layout.tsx`
- `apps/web/src/lib/session.ts`
- `apps/web/src/components/session-provider.tsx`
- `apps/web/src/components/layout/user-menu.tsx`
- `apps/web/src/components/feed/sidebar/viewer-card.tsx`
- `apps/web/src/app/u/[username]/page.tsx`
- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/app/settings/page.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/web/e2e/auth-settings.spec.ts`
- `apps/web/e2e/search-profile.spec.ts`
- `apps/web/e2e/auth-handoff.spec.ts`

---

## 6. Profile reputation, content tabs, followers, and following

**Decision status: deliberately deferred on 2026-07-21, except that the rejected
“Builders Helped” metric must eventually be removed from the profile.**

### What the profile currently displays

The profile header renders five display-only reputation values. They are not links or buttons:

- **Stories Shared**: number of currently existing Ls whose type is `STORY`.
- **Lessons Shared**: number of currently existing Ls whose type is `LESSON`.
- **Builders Helped**: active helpful reactions from other users, as defined in question 1.
- **Ls Shared**: number of all currently existing Ls by the author, across every L type.
- **Collections Created**: number of currently existing collections by the user.

This explains how a profile can show `0 Stories Shared`, `0 Lessons Shared`, and `2 Ls Shared`: the
two Ls use other types. The current taxonomy has L, Win, Story, Scar, Plot Twist, Checkpoint,
Battle, and Lesson.

Below that, follower and following counts are plain text. The backend already implements paginated
followers and following endpoints, but the frontend exposes neither endpoint in its API wrapper and
has no follower/following list page. The counts therefore cannot currently be opened.

The actual buttons below the profile are a large tab set: Journey, All, every L type, and
Collections. Many tabs can naturally be empty, particularly on a new profile.

### Why it was created

The initial product direction explicitly replaced LinkedIn-style status and follower emphasis with
contribution/usefulness signals. The profile taxonomy was intended to let readers explore distinct
kinds of career experience, while Journey provides a chronological view.

### Product problems to resolve

- The metrics are not self-explanatory and some overlap (`Stories`, `Lessons`, and all `Ls`).
- “Builders Helped” overclaims its underlying measurement.
- A row of five numbers can feel like vanity metrics despite the stated goal of avoiding them.
- The content-type tab row mirrors the full backend enum rather than prioritizing the visitor's
  likely profile task.
- Followers/following look like familiar social links but are non-interactive.

### Decisions required

- Should reputation metrics be removed, reduced to a smaller set, renamed, or made interactive?
- If a count is interactive, what destination or filter should it open?
- Which profile task should dominate: understanding the person's story, browsing all writing,
  following them, viewing a timeline, or viewing curated collections?
- Should empty L-type sections be hidden, grouped under a filter, or remain explicit tabs?
- Is Journey the default and primary profile view?
- Should Followers and Following open lists now, remain non-interactive counts, or be removed from
  emphasis?
- Should follower/following lists be public to everyone, visible only when logged in, or subject to
  another privacy rule?
- Are Collections a profile-level public artifact worth keeping in the primary navigation?
- Does the product still want all eight L types, especially when several counters/tabs can be zero?

### Runtime evidence

- `packages/contracts/src/enums.ts` (`L_TYPE_META`, `REPUTATION_META`)
- `packages/contracts/src/user.ts`
- `apps/web/src/components/profile/profile-header.tsx`
- `apps/web/src/components/profile/profile-tabs.tsx`
- `apps/api/src/modules/users/users.mapper.ts`
- `apps/api/src/modules/follows/follows.controller.ts`
- `apps/api/src/modules/ls/ls.write-plan.ts`
- `apps/api/src/modules/collections/collections.repository.ts`

---

## Cross-topic decisions

Some choices cannot be made independently:

- If Saved becomes a true private bookmark instead of a reaction, reaction counts, popularity,
  profile behavior, and the Saved page contract must all agree.
- If open-ended reactions replace fixed meanings, `Builders Helped` cannot silently remain coupled
  to the old Helpful identifier.
- If Search and Saved replace the left discovery rail, People to Follow and the viewer card need an
  explicit new home or an explicit removal decision.
- If sidebars become a persistent shell on Search, decide whether that shell also applies to
  profiles, L details, Saved, notifications, and settings.
- If profile metrics become filters, they overlap with the current All/type tab system and should be
  designed together rather than adding another navigation layer.
- The session-consistency reproduction should be resolved before new authenticated navigation or
  live-search state is used as evidence that session behavior is correct.

## Accepted decisions

| Date | Question | Accepted decision |
|---|---|---|
| 2026-07-21 | 1 | Remove “Builders Helped” as a product metric; do not rename or redefine it. |
| 2026-07-21 | 2 | Use Slack-style reaction chips with the existing fixed catalog; allow multiple reactions per user; no custom emoji; keep Saved unchanged; show only `+` when empty; with more than three used reactions show two plus `+X`. The scope of removing legacy reaction behavior still needs clarification. |
| 2026-07-21 | 3 | Keep the viewer card and header search; add Search and Saved below the viewer card; keep People to Follow below them; a signed-out Save action redirects to login. |
| 2026-07-21 | 4 | Search after every character starting with the first; the header dropdown shows one top L and up to three people; results open their destinations; both groups have “See all” actions into retained Ls/People tabs; left-rail Search opens the full centre with both rails; an empty full-search centre shows the feed. |
| 2026-07-21 | 5 | Deferred; do not diagnose or implement in the current product-flow scope. |
| 2026-07-21 | 6 | Deferred apart from removing “Builders Helped”; do not redesign the rest of the profile yet. |

## Deferred delivery checklist

Do not begin this checklist until the relevant product decisions are accepted.

- Convert accepted flows into screen states and navigation behavior.
- Update the product glossary when labels and meanings are final.
- Decide whether an ADR is warranted only for hard-to-reverse domain choices such as open custom
  emoji ownership or separating Saved from reactions.
- Prepare contract/data changes only after interaction design is stable.
- Write regression/acceptance tests for each accepted behavior before implementation.
- Reconcile `product.md`, contracts, OpenAPI, architecture notes, runbook, and TODO when shipped.
