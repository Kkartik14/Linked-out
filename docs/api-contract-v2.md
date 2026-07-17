# LinkedOut — API Contract v2 (frontend target)

Status: **accepted contract; backend implementation complete**
Decision date: 2026-07-17

This is the contract new frontend work builds against. The live v1 API continues unchanged during
the migration documented below. Do not use v1's `category`, `company`, `tags`, `eventDate`, derived
journey `date`, category filters, or popular-tags endpoint in new code.

- Base URL: `https://api.linkedout.app/v2` (dev: `http://localhost:4000/v2`)
- Shared types and runtime validation: `@linkedout/contracts/v2`
- Format: JSON; request bodies use `Content-Type: application/json`
- Authentication: browser cookie, always call with `credentials: 'include'`
- IDs: opaque ULIDs
- Timestamps: ISO 8601 UTC strings
- Lists: `{ "data": [], "nextCursor": null }`; cursors are opaque
- Errors: the existing `{ "error": { "code", "message", "details?" } }` envelope

The Zod schemas are authoritative for shapes. This document adds the behavioral rules that a type
cannot express: privacy, eligibility, ordering, time windows, cache policy, and failure behavior.

## 0. Authentication is uniform across v2

Every v2 route answers a credential the same way, whatever the route otherwise does:

- **No credential presented** — routes documented `Authentication: optional` serve the guest view;
  routes requiring authentication return `401`.
- **A credential is presented and is invalid or expired** — always `401`, on every v2 route,
  including `GET /v2/auth/me`. v2 never silently downgrades a bad credential to a guest.

This differs from v1, which downgrades an invalid credential to guest on its optional-auth reads.
v1 keeps that behavior for its live consumers; v2 does not inherit it. §3's "all existing v1
resources continue under `/v2` unless changed below" is about resource *shapes* and does not carry
v1's lenient credential handling into v2.

The asymmetry this rule forbids is concrete: if `/v2/auth/me` answered `200 {user: null}` for a
dead session while `/v2/feed` answered `401`, a client would read "signed out" from the former and
never attempt a refresh, while the latter told it the session merely needed one.

## 1. Clean L model

`LCard` contains:

```ts
type LCard = {
  id: string;
  title: string;
  storyPreview: string;
  type: LType;
  visibility: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  isAnonymous: boolean;
  resolvedAt: string | null;
  author: UserSummary | null;
  reactions: ReactionsSummary;
  commentCount: number;
  viewer: { reactions: ReactionType[]; canEdit: boolean };
  createdAt: string;
};
```

`LDetail` replaces `storyPreview` with `story` and adds `collections: CollectionRef[]`.
`author` is always `null` when `isAnonymous` is true. `JourneyNode` contains `createdAt` and is
ordered by `(createdAt ASC, id ASC)`; it has no separate event/effective date.

Create body:

```ts
{
  title: string;       // 1..140
  story: string;       // 1..10,000
  type?: LType;        // default L
  visibility?: Visibility; // default PUBLIC
  isAnonymous?: boolean;   // default false
}
```

Update accepts those fields plus `resolvedAt: ISO timestamp | null`, with every field optional but
at least one required. Create/update bodies are strict: legacy or unknown keys receive
`400 VALIDATION_ERROR`; they are never silently ignored.

## 2. Feed sidebar aggregate

```http
GET /v2/feed/sidebar
Authentication: optional
Query parameters: none
200 FeedSidebarResponse
Cache-Control: private, no-store, max-age=0
```

One call supplies both visual rails. The wire does not encode `left` or `right`: placement is a
frontend layout concern. The backend owns eligibility and returned order.

```ts
type FeedSidebarResponse = {
  contractVersion: 2;
  generatedAt: string;
  refreshAfter: string;
  viewer:
    | { state: 'SIGNED_OUT'; profile: null }
    | { state: 'ONBOARDING_REQUIRED'; profile: UserProfile }
    | { state: 'READY'; profile: UserProfile };
  peopleToFollow: {
    personalized: boolean;
    items: SuggestedUser[]; // max 5
  };
  topLs: {
    basis: 'MOST_INTERACTED';
    window: InteractionWindow;
    items: FeaturedL[]; // max 5
  };
  lOfTheDay: null | {
    selectedFor: string; // UTC YYYY-MM-DD
    basis: 'MOST_INTERACTED';
    window: InteractionWindow;
    item: AttributedFeaturedL;
  };
};

type SuggestedUser = {
  user: UserSummary;
  reason:
    | { code: 'MUTUAL_FOLLOWS'; count: number; text: string }
    | { code: 'ACTIVE_BUILDER'; text: string };
  viewer: { canFollow: boolean };
};

type FeaturedL = {
  l: LCard;
  interactionCount: number; // >= 1; a featured L always has an eligible interaction
  interactionLabel: string;
};

type InteractionWindow = { startsAt: string; endsAt: string };
```

Render `reason.text` and `interactionLabel` verbatim. Use `viewer.canFollow`; do not recreate follow
permission. `interactionCount` means distinct external builders, not raw reactions + comments and
not the internal lifetime popularity score.

`interactionLabel` is derivable from `interactionCount` today, and that redundancy is deliberate
rather than an oversight. The label is business copy, which this API owns (the frontend is a dumb
client): its wording and pluralization change without a contract version, and the count is the
machine-readable value for sorting, tests, and analytics. Clients render the label and never
recompose it from the count — a client that did would silently keep the old copy after the server
changed it. `SuggestedUser.reason` carries the same count-plus-text pairing for the same reason.
The two are composed from a single value at one site, so they cannot disagree.

### Viewer and people invariants

- `SIGNED_OUT` means no credential was presented. `ONBOARDING_REQUIRED` and `READY` identify exactly
  the authenticated viewer; the profile is never another user.
- Invalid or expired presented credentials receive `401` (§0); they are not silently treated as
  guest, so `SIGNED_OUT` never stands in for a rejected credential.
- `personalized` is true only for `READY`. Guests and onboarding viewers receive the safe global
  fallback.
- A suggestion is onboarded, has a non-empty username, is not the viewer, is not already followed
  by the viewer at `generatedAt`, and exposes only `UserSummary` public fields.
- Signed-in order: mutual-follow count descending; then distinct external actors interacting with
  the candidate's public attributed Ls over 30 days; follower count; user ID ascending.
- Guest/fallback order skips mutual follows and starts at 30-day activity. The reason is
  `MUTUAL_FOLLOWS` when count is positive, otherwise `ACTIVE_BUILDER`.

### Top Ls invariants and ranking

- Window: rolling seven days ending at `generatedAt`; both bounds are returned.
- Eligibility: current `PUBLIC` visibility. Anonymous Ls may appear here, but their author remains
  `null`; the endpoint never de-anonymizes content.
- Count distinct non-author users who reacted (except `SAVED`) or commented in the window. One user
  contributes at most once per L per window, regardless of actions or comment count.
- Require at least one eligible interaction. Tie-break by distinct `HELPFUL` reactors descending,
  distinct commenters descending, then L ID ascending.
- `items` order is authoritative. IDs are unique. The daily winner is excluded and the next ranked
  Top L fills its place.

### L of the day invariants and ranking

- `selectedFor` is the current UTC date. Its interaction window is the previous completed UTC day:
  start inclusive at `00:00:00Z`, end exclusive at the next `00:00:00Z`.
- Uses the same distinct-actor count and tie-breaks as Top Ls.
- Must be `PUBLIC`, non-anonymous, and authored by an onboarded persisted user with a non-empty
  username. This is the enforceable meaning of “real user”; v2 does not claim identity verification
  or bot detection.
- The winner ID is stable for `selectedFor`. If it becomes deleted, private, or anonymous, reselect
  deterministically from the same closed window or return `null`.
- Return `null` when no positive eligible candidate exists; never fill with unrelated content.

### Freshness, errors, and performance

- `generatedAt` is when viewer state and eligibility were composed. `refreshAfter` is the cache
  staleness boundary, not a scheduled-polling instruction or permission to retain stale
  authorization state. Refetch after a natural remount past this time and invalidate after follow,
  authentication, or onboarding changes.
- The complete viewer-dependent response is never stored by browser/shared caches. The backend may
  cache global candidate IDs for at most 60 seconds (Top Ls) and the closed-day winner for its UTC
  day, but must rehydrate and recheck current eligibility for every response. Never cache a mapped
  `LCard`, because it contains viewer state.
- Empty candidate sets are `200` with empty arrays or `lOfTheDay: null`. Unknown query parameters are
  `400`; invalid/expired authentication is `401`; normal global `429` and `500` envelopes apply.
- This ancillary request fails independently of the center feed. The frontend may hide the rails on
  failure while leaving the main feed usable.

## 3. Other v2 endpoint changes

All existing v1 resources continue under `/v2` unless changed below:

| Endpoint | v2 change |
|---|---|
| `POST/PATCH /ls` | Clean strict bodies from §1 |
| All responses containing `LCard`/`LDetail` | Clean canonical L shape from §1 |
| `GET /users/:username/journey` | `createdAt`; order `(createdAt, id)` ascending |
| `GET /feed`, `/feed/following` | `sort`, `limit`, `cursor`; no `filter` |
| `GET /search` | `q`, `type`, `limit`, `cursor`; no category `filter` |
| `GET /meta/enums` | No `lCategory` member |
| `GET /tags/popular` | Removed; there is no v2 route |
| `GET /feed/sidebar` | New aggregate defined in §2 |

`LCategory`, `lCategorySchema`, `L_CATEGORY_META`, feed-category mapping types, popular-tag request/
response types, and the four removed L fields are not exported from `@linkedout/contracts/v2`.

## 4. Frontend implementation boundary

Frontend may import schemas/types from the v2 subpath and use a schema-validated fixture when it
needs to run without a backend:

```ts
import {
  feedSidebarResponseSchema,
  type FeedSidebarResponse,
  type LCard,
} from '@linkedout/contracts/v2';
```

The frontend renders the supplied ordering, copy, counts, permissions, empty states, and anonymous
author state. It does not rank, calculate interaction totals, infer mutual follows, or fall back to
v1 fields. Any local fixture must pass `feedSidebarResponseSchema.parse()`.

## 5. Parallel delivery and retirement

1. Shared v2 package export and this contract are available.
2. The frontend can build against a schema-validated fixture; the backend implements `/v2` and
   `/v2/openapi.json` independently.
3. Deploy v1 and v2 together. Existing database columns remain internal during coexistence but
   mappers/repositories must not emit them on v2.
4. Switch frontend traffic to v2 and observe errors/usage.
5. Retire v1 consumers and routes.
6. Only then remove legacy code, search-vector inputs, seed fields, Prisma columns/enums, and add the
   destructive database migration.

This sequence avoids pretending the current v1 runtime has already changed and avoids breaking the
existing frontend while the two teams work independently.
