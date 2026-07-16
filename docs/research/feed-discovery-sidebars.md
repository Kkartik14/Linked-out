# Feed discovery sidebars: research and minimal Interface alternative

Status: research input, superseded where it differs by
[`docs/api-contract-v2.md`](../api-contract-v2.md). The accepted contract uses
`GET /v2/feed/sidebar`, an explicit viewer-state union, and permits anonymous content in Top Ls
while requiring an attributed author for L of the day. No backend route is implemented yet.

Research date: 2026-07-17

## Research recommendation in one paragraph

Add one optional-auth aggregate read that returns everything the feed page needs
outside its central list: the signed-in viewer's existing `UserProfile` (or `null` for a guest),
people to follow, top attributed Ls for an explicit seven-day interaction window, and one stable
attributed L selected for the current UTC day from the previous completed UTC day's interactions.
The backend owns eligibility, privacy, ranking, tie-breaking, and freshness; the frontend renders
the returned order without recreating policy. Do not call either content section “trending.” Also
remove `category`, `eventDate` (including its derived journey `date` alias), `company`, and `tags`
from the canonical L wire contract rather than creating a second “clean” L shape for this route.

## What the primary sources establish

### A sidebar can mix self, network growth, and content discovery

LinkedIn describes its feed inventory as heterogeneous: network posts, news, jobs, and people
recommendations are independently ranked before being combined. It also names the social graph as
an important relevance input. That supports separate profile, people, and content sections, but it
does not require separate frontend ranking logic or separate HTTP round trips.
([LinkedIn Engineering: Feed](https://engineering.linkedin.com/teams/data/artificial-intelligence/feed))

LinkedIn's “People You May Know” documentation says suggestions are based on commonalities such as
shared connections and similar profile/experience data, and that a user can remove suggestions.
LinkedOut currently has a follow graph but no employer, school, contact-import, dismissal, or block
model. The first implementation should therefore use the graph and public writing activity it
actually owns, not invent unavailable affinity data.
([LinkedIn Help: People You May Know](https://www.linkedin.com/help/linkedin/answer/a544682/people-you-may-know-feature-))

X likewise documents account suggestions based on following/activity and other signals, while
making contact discoverability controllable. The relevant lesson is not to copy contact or location
signals; it is that a recommendation feature must have a stated data basis and must not silently
reuse private data.
([X Help: account suggestions](https://help.x.com/en/using-x/account-suggestions))

### “Popular” and “trending” are different product claims

X explicitly distinguishes topics popular now from topics that have accumulated popularity over
time, and says raw post volume is only one ranking factor. X also adds context explaining why a
topic is shown. Therefore, a lifetime counter is “popular,” not “trending,” and a windowed result
should expose its window or reason.
([X Help: Trends FAQ](https://help.x.com/en/using-x/x-trending-faqs))

This distinction matches the current LinkedOut implementation: `L.popularityScore` and
`popularity.policy.ts` are explicitly lifetime-based and have no decay. Reusing that field for a
panel labelled “Trending” would be false. This proposal instead uses “Top Ls” with the precise
meaning “most interacted within the returned seven-day window.”

### Ranking should be explainable without exposing a gameable score

LinkedIn says feed relevance considers identity, content, and activity signals; content recency and
conversation quality matter alongside engagement. It also gives users ways to influence what they
see. X similarly says recommendations use multiple signals and provides contextual reasons, such as
who in a network follows an author. The useful v1 transparency mechanism here is a small typed
reason for each person suggestion and explicit time windows for content—not a raw internal score.
([LinkedIn Help: relevance](https://www.linkedin.com/help/linkedin/answer/a1339724),
[X Help: recommendation approach](https://help.x.com/en/rules-and-policies/recommendations))

### Engagement totals alone invite manipulation

LinkedIn says it may reduce distribution of content designed to artificially increase engagement,
including reaction polls and requests intended to manufacture reactions. X distinguishes content
existence from recommendation eligibility and filters spammy or harmful accounts from
recommendations. A discovery panel is amplification, so “most interaction” should count distinct,
non-author actors in the window rather than unbounded comments or every action by one account.
Private saves must not contribute.
([LinkedIn Help: Spam](https://www.linkedin.com/help/linkedin/answer/a1338787),
[X Help: recommendation approach](https://help.x.com/en/rules-and-policies/recommendations))

This is an engineering inference from those policies, not a claim that LinkedIn or X uses the exact
formula proposed below.

### Privacy must be an eligibility rule, not a mapper accident

X documents that recommendation is a separate amplification decision: some content can remain
available to its intended audience without being eligible for broader recommendations. LinkedOut
should make the same distinction. A followers-only or private L may be viewable in another context,
but it is never eligible for the global top or daily panels. An anonymous L may remain in the main
feed, but a panel whose product requirement is to show a “real user” must only use attributed Ls.
([X Help: recommendation approach](https://help.x.com/en/rules-and-policies/recommendations))

Here “real user” can only mean “a persisted, non-anonymous author” with today's domain model. The
contract cannot truthfully guarantee a verified human or non-bot account because no verification
or account-quality field exists. If product intends that stronger meaning, it requires a separate
domain decision and data source.

### Cache behavior must be explicit for a viewer-dependent response

HTTP caching defines freshness from explicit expiry metadata and supports validators such as ETags.
It also defines `private` as preventing shared-cache storage and `no-store` as preventing storage by
private and shared caches. The repository's proposed auth ADR already chooses
`Cache-Control: private, no-store, max-age=0` for viewer-dependent reads; this endpoint includes a
self profile, follow state, and viewer reactions, so it follows that policy.
([RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111.html#name-private),
[RFC 9111: no-store](https://www.rfc-editor.org/rfc/rfc9111.html#name-no-store),
[ADR 0001](../adr/0001-auth-session-topology.md#45-the-rest-of-the-epic))

## Proposed wire Interface

The external **Seam** is the shared Zod contract plus the route contract for one endpoint:

```http
GET /feed/overview
Optional authentication
200 FeedOverview
Cache-Control: private, no-store, max-age=0
```

Illustrative contract (names are proposed, not implemented):

```ts
const suggestionReasonSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('MUTUAL_FOLLOWS'),
    count: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('ACTIVE_WRITER') }),
]);

const personToFollowSchema = z.object({
  user: userSummarySchema,
  reason: suggestionReasonSchema,
});

// A refinement of the one canonical LCard, not a parallel card model.
const attributedLCardSchema = lCardSchema.extend({
  isAnonymous: z.literal(false),
  author: userSummarySchema,
});

const interactionWindowSchema = z.object({
  startsAt: isoTimestampSchema,
  endsAt: isoTimestampSchema,
});

const feedOverviewSchema = z.object({
  viewer: userProfileSchema.nullable(),
  peopleToFollow: z.object({
    personalized: z.boolean(),
    items: z.array(personToFollowSchema).max(5),
  }),
  topLs: z.object({
    basis: z.literal('MOST_INTERACTED'),
    window: interactionWindowSchema,
    items: z.array(attributedLCardSchema).max(5),
  }),
  lOfTheDay: z
    .object({
      selectedFor: z.iso.date(),
      basis: z.literal('MOST_INTERACTED'),
      window: interactionWindowSchema,
      l: attributedLCardSchema,
    })
    .nullable(),
  generatedAt: isoTimestampSchema,
});

type FeedOverview = z.infer<typeof feedOverviewSchema>;
```

`LCard` must first be cleaned at its canonical definition. Do not use `omit()` only on
`attributedLCardSchema`; otherwise removed fields remain on every other L response and future
engineers still see two competing models.

### Response invariants

- `viewer` is the existing full `UserProfile` for exactly the authenticated principal; it is
  `null` for a credential-absent guest. It is never another user's profile.
- `peopleToFollow.personalized` is `true` exactly when a valid viewer is present. A guest receives
  a globally ranked public-author fallback, so the section need not disappear.
- A people suggestion has a non-null username, is not the viewer, and is not already followed by
  the viewer at `generatedAt`. Suggestions contain only public profile fields already present in
  `UserSummary`.
- Every `topLs.items[*]` and `lOfTheDay.l` is `PUBLIC`, non-anonymous, and has a non-null persisted
  author when the response is produced. No `FOLLOWERS` or `PRIVATE` L is eligible, even when the
  viewer could otherwise see it.
- An L with no eligible interaction in the relevant window does not enter either ranking.
- `lOfTheDay` is `null` when the previous completed UTC day has no eligible candidate. The backend
  does not fill the slot with arbitrary content.
- IDs do not repeat within a section. The daily L is omitted from `topLs` and the next ranked L is
  used, preventing the right rail from showing the same L twice.
- Removed fields never reappear as sidebar-specific aliases. `createdAt` remains the system
  publication timestamp; it is not the removed “when it happened” field.

### Ordering and deterministic ranking

The wire does not expose a numeric score. The returned array order is authoritative.

People to follow, authenticated:

1. Candidate eligibility above.
2. Mutual-follow count descending.
3. Distinct non-author users engaging with the candidate's public, attributed Ls in the previous
   30 days, descending.
4. Candidate follower count descending.
5. Candidate user ID ascending as the total deterministic tie-breaker.

The reason is `MUTUAL_FOLLOWS` when its count is positive; otherwise it is `ACTIVE_WRITER`. For a
guest, steps 2 and the mutual reason are unavailable, so ordering begins at step 3. The frontend
shows the typed reason and never reverse-engineers it from counts.

Top Ls:

1. Use a rolling seven-day window ending at `generatedAt`; return both endpoints.
2. Count distinct eligible actors who reacted or commented in the window. An author does not count
   on their own L, a user contributes at most once per L per window, and `SAVED` never contributes.
3. Tie-break by distinct `HELPFUL` reactors descending, then distinct commenters descending, then L
   ID ascending.
4. Apply current eligibility again after hydration, not only during candidate selection.

L of the day:

1. `selectedFor` is the current UTC calendar date.
2. The interaction window is the previous completed UTC calendar day (`00:00:00Z` inclusive to the
   next `00:00:00Z` exclusive).
3. Use the same actor counting and tie-breakers as Top Ls.
4. Snapshot the winning ID for `selectedFor`, making it stable for that UTC day. If deletion,
   visibility, or anonymity changes make it ineligible, reselect deterministically from the same
   closed window or return `null`.

These definitions give a reproducible order at a database snapshot, resist one-account comment
spam, and avoid claiming to measure velocity. A later true-trending design would need a new named
basis with decay or acceleration; it must not silently change `MOST_INTERACTED` semantics.

### Errors

- No credentials: `200` guest response.
- Valid credentials: `200` personalized response.
- Expired or invalid presented credentials: `401` using the existing stable error envelope. Do not
  silently turn a presented bad credential into a guest response once the auth ADR is implemented.
- Infrastructure/ranking query failure: existing `500 INTERNAL` envelope. Do not return a
  legitimate-looking partial ranking that hides an outage.
- Global rate limit: existing `429 RATE_LIMITED` envelope.
- Empty candidate sets are successful empty arrays or `lOfTheDay: null`, never `404`.

The page's main feed request remains independent. If this ancillary request fails, the frontend may
omit the side sections while keeping the feed usable; that is a page composition decision, not a
partial-success wire format.

### Freshness and invalidation

- HTTP: `private, no-store, max-age=0`, matching ADR 0001. The payload is viewer-dependent even for
  sections whose candidate IDs were calculated globally.
- `generatedAt` tells the client when eligibility and viewer state were composed. It is not a client
  permission to keep stale private state.
- V1 needs no viewer-result cache. After an existing follow/unfollow mutation, the frontend
  optimistically removes/reinserts the suggestion and invalidates the overview query.
- The Implementation may keep process-local, bounded caches of global candidate IDs: at most 60
  seconds for Top Ls and one UTC day for the closed-window daily winner. It must rehydrate cards and
  re-check public/non-anonymous eligibility for every response.
- Do not cache a fully mapped `LCard`: it contains viewer reactions and `canEdit`.
- No Redis or new remote dependency is justified. Multi-instance candidate-cache disagreement is
  bounded by 60 seconds and does not weaken visibility because eligibility is rechecked.

## Canonical L contract removal checklist

The requested removal is broader than deleting four lines from `createLInputSchema`:

- Remove `category`, `company`, `tags`, and `eventDate` from `lCoreSchema`, `CreateLInput`, and
  `UpdateLInput`.
- Remove `category`, `company`, and `eventDate` from `JourneyNode`. Remove the derived `date` field
  too; it currently aliases `eventDate ?? createdAt` and would preserve the deleted concept under a
  vaguer name. Expose `createdAt` if the timeline needs its actual publication timestamp and order
  the journey by `createdAt, id`.
- Remove `LCategory`, `lCategorySchema`, category display metadata, and `lCategory` from
  `MetaEnumsResponse`.
- Remove `feedFilterSchema`, `FEED_FILTER_TO_CATEGORY`, and `filter` from feed queries. The category
  chips in the supplied feed UI disappear; do not silently reinterpret them as L types.
- Remove the L search `filter` query member and category filtering from its public contract.
- Remove `PopularTagsQuery`, `PopularTagsResponse`, and the `GET /tags/popular` route contract; a
  discovery route for a field no L can write is misleading.
- Remove those schemas and route entries from the OpenAPI registry and package exports, then update
  contract fixtures/tests. This is a removal, not a deprecation with ignored request members:
  strict mutation bodies must reject the old names.

Database columns, migrations, search-vector generation, seed data, repositories, and UI cleanup are
backend/frontend implementation work after the wire decision. They must be handled, but they are not
reasons to leave obsolete fields in the shared contract frontend engineers consume.

## Minimal deep Module alternative

### Module and Interface

Name: **FeedOverview Module**.

Its external **Interface** has one entry point:

```ts
interface FeedOverviewModule {
  load(viewerId: string | undefined): Promise<FeedOverview>;
}
```

The type alone is not the full Interface. The eligibility, order, error modes, UTC windows, cache
behavior, and performance bounds above are part of it. The **Seam** lives at this method for backend
callers/tests and at `GET /feed/overview` plus `feedOverviewSchema` for the frontend.

This Module has high **Depth** because one call hides self-profile composition, social-graph
candidate generation, two windowed interaction rankings, attribution/visibility enforcement,
viewer reaction hydration, deterministic tie-breaking, and freshness policy. That is substantial
**Leverage** for the controller and dumb frontend. It also creates **Locality**: changing ranking or
eligibility happens in one Implementation instead of the page, several endpoint clients, and tests.

### Usage

Backend controller adapter:

```ts
@Get('overview')
@UseGuards(OptionalAuthGuard)
@ApiContract(API_ROUTE_CONTRACTS.feedOverview)
overview(@OptionalUser() user: AuthUser | undefined): Promise<FeedOverview> {
  return this.overview.load(user?.id);
}
```

Frontend:

```tsx
const overview = await getFeedOverview();

return (
  <FeedLayout
    profile={overview.viewer}
    people={overview.peopleToFollow.items}
    topLs={overview.topLs.items}
    lOfTheDay={overview.lOfTheDay}
  />
);
```

The frontend does not sort, join users to Ls, infer anonymity, calculate dates, or make an N+1
profile request. Existing follow/unfollow and L navigation entry points remain unchanged.

### Hidden Implementation

Behind the Seam, the Module owns:

- a controller adapter from optional-auth HTTP to `viewerId | undefined`;
- one orchestration method that runs independent profile, people, top, and daily reads in parallel;
- repository queries for mutual-follow candidates and interaction-window candidate IDs;
- the ranking policy, daily snapshot, and deterministic tie-breakers;
- final hydration through canonical L/user mappers so viewer reactions and author redaction cannot
  drift from the main feed;
- final eligibility checks after hydration;
- bounded global candidate-ID caching, if profiling later justifies it;
- response assembly and `generatedAt` from one captured clock instant.

The controller must not become a four-call pass-through orchestrator; otherwise deleting the Module
would spread policy across callers and fail the deletion test.

### Dependency category and Adapters

- Ranking and composition are **in-process** dependencies (category 1). No Adapter is needed merely
  to split pure functions.
- Prisma/Postgres is **local-substitutable** (category 2) using the repository's real local test
  database. Keep that Seam internal: production and integration tests exercise the Module through
  `load`, not through a new public repository port.
- Time has two legitimate internal Adapters—a system clock in production and a fixed clock in
  tests—so an internal `Clock` Seam is real. Do not put a `now` parameter on the external Interface.
- There is no remote-owned or true-external dependency. Do not add Redis, a ranking microservice, or
  an abstract cache port for one Implementation. One Adapter would make that a hypothetical Seam.

The concrete shape remains the repository's established Nest controller → service → repository →
Prisma/Postgres flow. New tests should assert behavior through `FeedOverviewModule.load` with a fixed
clock and test database; internal query helpers are not a second test surface.

### Tradeoffs

Strengths:

- One request gives frontend/backend teams an explicit parallel-work contract.
- Privacy and attribution are server invariants, not UI conventions.
- The closed daily window makes “of the day” deterministic and stable.
- Distinct-actor ranking is harder to game than raw action totals.
- One canonical `LCard` prevents sidebar drift after the field removals.

Costs:

- A single aggregate response cannot be shared-cacheable because it includes viewer state. This is
  the principal cost of minimizing the Interface.
- If one section's database read fails, the endpoint fails atomically. The main feed still works,
  but the whole overview is omitted until retry.
- Previous-day selection favors stability over a live, changing “leader right now.” If product
  wants a live leader, it should be named “Leading today,” carry a short explicit freshness window,
  and accept churn.
- Distinct-actor scoring deliberately differs from the current lifetime `popularityScore`. That is
  clearer and safer, but it requires dedicated aggregate queries or snapshots in the backend.
- This alternative gives ranking policy strong Locality but less endpoint-level flexibility. If a
  future screen needs only people recommendations at high frequency, the team should first measure
  whether the extra overview fields are a real cost before widening the Interface.
