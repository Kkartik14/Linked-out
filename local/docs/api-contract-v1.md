# LinkedOut — API Contract v1

Status: **sole public resource contract; API implementation complete.** The public BFF/`lo_sid`
browser cutover is tracked separately in ADR 0001 and `TODO.md`.
Decision date: 2026-07-17

This is the sole contract for frontend and backend work. Authenticated unsafe requests require
`X-LinkedOut-Principal`, logout is credential-optional and idempotent, and private BFF lifecycle
endpoints live under v1. The removed `category`, `company`, `tags`, `eventDate`, Journey and
Collection resources, category filters, and popular-tags endpoint are not part of the public API. First-party
email/password sign-in with an emailed one-time code (feature 1.1.3) is specified in §0.1; it reuses
the OAuth session handoff and introduces no second session type.

- Base URL: `https://api.linkedout.app/v1` (dev: `http://localhost:4000/v1`)
- Shared types and runtime validation: `@linkedout/contracts`
- Format: JSON; request bodies use `Content-Type: application/json`
- Authentication: browser cookie, always call with `credentials: 'include'`
- IDs: opaque ULIDs
- Timestamps: ISO 8601 UTC strings
- Lists: `{ "data": [], "nextCursor": null }`; cursors are opaque
- Errors: the existing `{ "error": { "code", "message", "details?" } }` envelope

The Zod schemas are authoritative for shapes. This document adds the behavioral rules that a type
cannot express: privacy, eligibility, ordering, time windows, cache policy, and failure behavior.

## 0. Authentication is uniform

Every public route answers a credential the same way, whatever the route otherwise does:

- **No credential presented** — routes documented `Authentication: optional` serve the guest view;
  routes requiring authentication return `401`.
- **A credential is presented and is invalid or expired** — always `401`, on every public route,
  including `GET /v1/auth/me`. The API never silently downgrades a bad credential to a guest.

The asymmetry this rule forbids is concrete: if `/v1/auth/me` answered `200 {user: null}` for a
dead session while `/v1/feed` answered `401`, a client would read "signed out" from the former and
never attempt a refresh, while the latter told it the session merely needed one.

### Mutation principal binding

Every authenticated unsafe request (`POST`, `PUT`, `PATCH`, or `DELETE`) must send
`X-LinkedOut-Principal: <user ULID>`. The value is the principal under whom the view or form was
composed, not an identity re-read from the current cookie at submit time. A missing, malformed, or
different value returns `409 PRINCIPAL_MISMATCH`, preventing a stale tab rendered for one account
from mutating another account after shared cookies change. Anonymous unsafe requests still follow
the endpoint's normal authentication behavior.

## 0.1 Email and password authentication (feature 1.1.3)

Email/password is a second credential attached to the existing `User`. It does **not** introduce a
second session type: a successful signup verification or password login returns the same single-use
handoff `code` the OAuth flow already returns (§ handoff below), which the BFF exchanges for the
opaque `lo_sid` browser session. Every endpoint lives under `/v1/auth/email`.

### Credential-authoring rule (why the password is set at verify, not at signup)

The account password is **authored at `POST /auth/email/verify`, by the party that presents the
emailed code — never earlier.** Signup carries the email only; it merely starts email verification.

This is deliberate. Collecting a password at signup and committing it when the email is later
verified allows account **pre-hijacking**: anyone can call signup for a victim's address with a
password of their choosing, and the victim's later verification would silently create an account
holding the attacker's password (Sudhodanan & Paverd, *Pre-hijacked accounts*, USENIX Security
2022; OWASP *Email Validation and Verification*: "do not activate accounts before verification is
completed"). Because proving inbox control and setting the credential are one atomic step here,
there is no pre-verification credential to seed or overwrite.

The frontend may still collect email **and** password on its signup screen; it sends only the email
to `/signup`, holds the password locally, and submits it together with the code to `/verify`. The
password never reaches the server until it is accompanied by proof of inbox control.

### Endpoints

| Step | Endpoint | Body | Success |
|---|---|---|---|
| Start signup | `POST /auth/email/signup` | `{ email }` | `202 { accepted: true, expiresInSeconds: 600 }` |
| Verify + set password | `POST /auth/email/verify` | `{ email, otp, password, returnTo? }` | `200 EmailAuthHandoffResponse` |
| Password login | `POST /auth/email/login` | `{ email, password, returnTo? }` | `200 EmailAuthHandoffResponse` |
| Resend code | `POST /auth/email/resend` | `{ email, purpose }` | `202 { accepted: true, expiresInSeconds: 600 }` |
| Forgot password | `POST /auth/email/password/forgot` | `{ email }` | `202 { accepted: true, expiresInSeconds: 600 }` |
| Reset password | `POST /auth/email/password/reset` | `{ email, otp, newPassword }` | `200 { ok: true }` |
| Inspect code (dev only) | `POST /auth/email/otp/inspect` | `{ email, purpose }` | `200 EmailOtpInspectResponse` |

```ts
type EmailAuthHandoffResponse = {
  code: string;      // 43-char base64url, single-use, ~60s TTL — same handoff the OAuth flow returns
  expiresAt: string; // ISO 8601
  returnTo: string;  // safe relative path
};
```

`password` and `newPassword` are ≥ 15 characters (NIST single-factor minimum; no composition rules),
≤ 128. `otp` is exactly 8 digits. `email` is trimmed and lower-cased into a canonical identity.
`returnTo` must be a safe relative path (leading `/`, no open redirect) and defaults to `/`.

### OTP and challenge behavior

- One durable challenge exists per `(canonical email, purpose)` where purpose is `SIGNUP` or
  `PASSWORD_RESET`. The two purposes are independent.
- The 8-digit code is generated with a CSPRNG, is valid for **10 minutes**, is accepted **at most
  once**, and is **exhausted after five wrong entries**; the attempt check, the constant-time digest
  comparison, and consumption all happen inside one row-locked transaction, so the five-attempt cap
  and single-use guarantee hold under concurrent requests.
- Resend keeps the **same** active code during its 10-minute window (so a person never receives two
  emails with conflicting codes). After expiry or exhaustion, the next eligible request mints a new
  code.
- Different emails never contend; a per-`(email, purpose)` advisory lock serializes only same-subject
  issuance and verification. Concurrent correct verifications produce exactly one account.
- The challenge stores only an HMAC-SHA-256 digest of the code (keyed by a deployment secret held
  outside the database), never the code itself. Codes older than their expiry are reaped by the
  bounded maintenance cleanup.

### Anti-enumeration and errors

- `signup`, `resend`, and `password/forgot` always return the same generic `202` whether or not the
  email is already registered; they never reveal account existence.
- `login` returns `401 INVALID_CREDENTIALS` for a wrong password, an unknown email, an
  email-without-password credential, or an unverified account — one indistinguishable response, with
  comparable timing (an unknown account still runs one password verification).
- A wrong, expired, superseded, consumed, or exhausted code returns `400 INVALID_OTP` — one generic
  response; the endpoint never says which.
- Password reset consumes its code, replaces the credential, and revokes **every** existing session
  (legacy refresh sessions deleted, browser sessions revoked) in the same recovery event. It does
  not auto-login; the user signs in normally afterward.
- All email-auth responses are `Cache-Control: private, no-store, max-age=0`.

### Configuration and the dev inspection endpoint

`EMAIL_DELIVERY_MODE` gates the feature: `disabled` fails every endpoint closed with
`503 PROVIDER_NOT_CONFIGURED`; `stub` enables it with an encrypted in-database capture instead of a
real provider. `POST /auth/email/otp/inspect` returns the current code for a `(email, purpose)` and
exists **only** in `stub` mode; it requires a constant-time-compared secret in the
`X-LinkedOut-OTP-Inspection` header, is rate-limited, and is an operator/test capability that must
sit behind a second access control (e.g. Vercel Deployment Protection) wherever it is exposed. It is
replaced by a real email provider before production; the provider seam does not change any rule above.

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

`LDetail` replaces `storyPreview` with `story`. `author` is always `null` when `isAnonymous` is
true. `LType` is exactly `L | WIN | STORY | SCAR | PLOT_TWIST | BATTLE`.

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

### Profile current chapter

`UserProfile.status` remains `JourneyStatus | null` on the wire for compatibility. Its product name
is **Current chapter**: the person's self-declared present career context. The only write seam is
`PATCH /users/me` with `{ status: JourneyStatus | null }`; there is no special status endpoint.
Current choices are Interviewing, Building, Working, Starting Up, Recovering, and Taking a Break.

## 2. Feed sidebar aggregate

```http
GET /v1/feed/sidebar
Authentication: optional
Query parameters: none
200 FeedSidebarResponse
Cache-Control: private, no-store, max-age=0
```

One call supplies both visual rails. The wire does not encode `left` or `right`: placement is a
frontend layout concern. The backend owns eligibility and returned order.

```ts
type FeedSidebarResponse = {
  contractVersion: 1;
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
    windowLabel: string;
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

Render `reason.text`, `topLs.windowLabel`, and `interactionLabel` verbatim. Use `viewer.canFollow`;
do not recreate follow permission. `interactionCount` means distinct external builders, not raw
reactions + comments and not the internal lifetime popularity score.

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
  username. This is the enforceable meaning of “real user”; the API does not claim identity verification
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

## 3. Other endpoint rules

All public resources live under `/v1`. The clean contract rules are summarized below:

| Endpoint | Public contract rule |
|---|---|
| `POST/PATCH /ls` | Clean strict bodies from §1 |
| All responses containing `LCard`/`LDetail` | Clean canonical L shape from §1 |
| `GET /feed`, `/feed/following` | `sort`, `limit`, `cursor`; no `filter` |
| `GET /search` | `q`, `type`, `limit`, `cursor`; no category `filter` |
| `GET /meta/enums` | No `lCategory` member |
| `GET /tags/popular` | Removed; there is no public route |
| `GET /feed/sidebar` | New aggregate defined in §2 |
| `POST /auth/email/*` | Email/password + OTP sign-in and password reset; defined in §0.1 |
| `GET /health/{private-api,database,session-authority}` | Internal operations probes; `200 { status: 'ok', component }` |

`LCategory`, `lCategorySchema`, `L_CATEGORY_META`, feed-category mapping types, popular-tag request/
response types, and the four removed L fields are not exported from `@linkedout/contracts`.

All responses default to `Cache-Control: private, no-store, max-age=0`. A controller must opt a
genuinely public, viewer-independent response into shared caching explicitly; enum metadata and
generated OpenAPI are the current static opt-ins. The health routes are versioned for uniform
routing but marked internal operations in generated OpenAPI.

## 4. Frontend implementation boundary

Frontend may import schemas/types from the root package and use a schema-validated fixture when it
needs to run without a backend:

```ts
import {
  feedSidebarResponseSchema,
  type FeedSidebarResponse,
  type LCard,
} from '@linkedout/contracts';
```

The frontend renders the supplied ordering, copy, counts, permissions, empty states, and anonymous
author state. It does not rank, calculate interaction totals, infer mutual follows, or fall back to
removed fields. Any local fixture must pass `feedSidebarResponseSchema.parse()`.

## 5. Consolidation record

On 2026-07-18, the pre-launch parallel surfaces were consolidated into this sole `/v1` contract.
The clean schemas, strict authentication behavior, feed sidebar, and generated OpenAPI became the
root contract; the obsolete compatibility implementation, export subpath, persistence fields, and
version-specific tests were removed in the same release. No alias or redirect remains.
