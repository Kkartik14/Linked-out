# LinkedOut — API Contract (v1.1)

> **For the frontend team.** This is the complete surface the backend exposes. The frontend is a thin client: render what these endpoints return, send user input back, and never re-derive state the API already gives you (permissions, counts, notification copy). If something you need isn't here, it's a backend change — ask, don't work around it.
>
> **v1.1 changelog** (answers to the FE review) is at the very bottom — every numbered point is addressed inline and cross-referenced there.

- **Base URL:** `https://api.linkedout.app/v1` (dev: `http://localhost:4000/v1`)
- **Format:** JSON only. `Content-Type: application/json` on every request with a body.
- **Versioning:** the `/v1` prefix. Breaking changes bump to `/v2`.
- **Machine-readable spec:** OpenAPI 3.1 at `/v1/openapi.json` — authoritative on shapes if it and this doc disagree.

---

## 0. Types: single source of truth (FE review #1)

**Import the `@linkedout/contracts` workspace package directly.** It exports the Zod schemas and their inferred TypeScript types that the backend validates against — so FE and BE share one definition and can never drift. Do **not** hand-write types from this doc, and don't codegen from OpenAPI unless you're outside the monorepo.

```ts
import type { LCard, UserProfile, CreateLInput } from '@linkedout/contracts'
```

- The package is linked in the pnpm workspace (`apps/web` depends on `@linkedout/contracts`).
- Every request body and response object named in this doc has a matching exported type/schema.
- `/v1/openapi.json` (generated from the same Zod schemas) is the fallback for non-TS consumers.

---

## 1. Conventions

### 1.1 Authentication (FE review #2)
Auth is **cookie-based and backend-owned**. The frontend never handles tokens.

- Send **every** request with credentials: `fetch(url, { credentials: 'include' })`.
- To log in, navigate the browser to `GET /v1/auth/google` or `GET /v1/auth/github`.
- Access cookie lives 15 min; on a `401 TOKEN_EXPIRED`, call `POST /v1/auth/refresh` once, then retry the original request.
- Endpoints are marked **Auth: required / optional / none**. *optional* = works logged-out but adds viewer-context (e.g. `viewer.reactions`) when logged in.

**OAuth redirect contract:**
- **Start:** `GET /v1/auth/google?returnTo=<relative-path>`. `returnTo` is optional, defaults to `/`, and **must be a relative path** (e.g. `/ls/01J...`) — absolute URLs are rejected to prevent open redirects.
- **Success:** backend sets cookies and 302-redirects to **`${WEB_URL}/auth/callback?returnTo=<path>`**. Your `/auth/callback` page should then call `GET /v1/auth/me` and route based on it:
  - `needsOnboarding: true` → send to `/onboarding` (after onboarding, forward to `returnTo`).
  - else → forward to `returnTo`.
- **Failure:** 302 to **`${WEB_URL}/auth/callback?error=<code>`**, where `<code>` ∈ `access_denied` (user cancelled), `oauth_failed` (provider error), `email_taken` (that email already belongs to a different provider login). Show a friendly message and offer retry.

### 1.2 Dev cross-origin cookie & CORS setup (FE review #3)
FE `:3000` and API `:4000` are **same-site** (SameSite ignores port; both are `localhost`), so `SameSite=Lax` cookies flow with `credentials:'include'` — **no `SameSite=None`/HTTPS needed in dev.**

| | Dev | Prod |
|---|---|---|
| Web origin | `http://localhost:3000` | `https://app.linkedout.app` |
| API origin | `http://localhost:4000` | `https://api.linkedout.app` |
| CORS `Allow-Origin` | `http://localhost:3000` (explicit, never `*`) | `https://app.linkedout.app` (explicit) |
| CORS `Allow-Credentials` | `true` | `true` |
| Cookie flags | `HttpOnly; SameSite=Lax; Path=/` (no `Secure` — browsers accept on `http://localhost`) | `HttpOnly; Secure; SameSite=Lax; Domain=.linkedout.app; Path=/` |

FE requirement either way: **always `credentials:'include'`** and use the exact API base URL (no trailing-slash redirects, which drop credentials).

### 1.3 IDs
Every `id` is a **ULID** — 26-char, URL-safe, lexicographically **time-sortable** string. Treat as opaque. Sort by `id` asc = oldest-first.

### 1.4 Timestamps
ISO 8601 UTC strings (`2026-07-07T12:00:00.000Z`).

### 1.5 Pagination (cursor-based)
List endpoints take `?limit=` (default 20, max 50 unless noted) and `?cursor=`:
```json
{ "data": [ /* items */ ], "nextCursor": "b3BhcXVl..." }
```
Pass `cursor=<nextCursor>` for the next page. **Cursor is opaque** — never parse/build it. `nextCursor: null` = end.

### 1.6 Response shape
- **Single resource** → the object directly (no envelope).
- **List** → the pagination envelope above.
- **Mutation** → the affected/updated resource, so you can update UI without a refetch.

### 1.7 Errors (FE review #7)
Non-2xx uses:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields need attention.",
    "details": [
      { "field": "title", "code": "too_long", "message": "Title must be at most 140 characters." },
      { "field": "tags[2]", "code": "too_long", "message": "Each tag must be at most 30 characters." }
    ]
  }
}
```
- `error.code` — stable machine string; **switch on this**, not `message`.
- `error.message` — human-readable, safe to display.
- `error.details` — **an array** (present only on `VALIDATION_ERROR`). Each entry: `field` (dot/bracket path), `code` (stable, see below), `message` (friendly, per-field). Render `message` inline, or map `code` to your own copy.

**Stable field-error `code` set:** `required` · `too_short` · `too_long` · `too_many` · `invalid_format` · `invalid_enum` · `not_a_url`.

| HTTP | Top-level `code`s |
|---|---|
| 400 | `VALIDATION_ERROR`, `BAD_CURSOR` |
| 401 | `UNAUTHENTICATED`, `TOKEN_EXPIRED` |
| 403 | `FORBIDDEN`, `NOT_L_OWNER` |
| 404 | `L_NOT_FOUND`, `USER_NOT_FOUND`, `COMMENT_NOT_FOUND`, `COLLECTION_NOT_FOUND` |
| 409 | `USERNAME_TAKEN`, `ALREADY_FOLLOWING` |
| 422 | `USERNAME_INVALID` |
| 429 | `RATE_LIMITED` (includes a `Retry-After` header) |
| 500 | `INTERNAL` |

### 1.8 Rate limits (FE review #10)
Soft limits per authenticated user: **reads ≈ 120/min**, **writes ≈ 30/min**. Polling `GET /notifications/unread-count` every **30–60 s** is well within limits. On `429`, honor `Retry-After`.

---

## 2. Enums

Exact string values below. **Display metadata (labels/emoji) is served at runtime from `GET /meta/enums`** (§4.12) so you never hardcode copy — but the labels are duplicated here for reference. (FE review #5)

### `LType` — kind of entry; drives the profile section it appears in
| Value | Singular label | Section header |
|---|---|---|
| `L` | L | Ls |
| `WIN` | Win | Wins |
| `STORY` | Story | Stories |
| `SCAR` | Scar | Scars |
| `PLOT_TWIST` | Plot Twist | Plot Twists |
| `CHECKPOINT` | Checkpoint | Checkpoints |
| `BATTLE` | Battle | Battles |
| `LESSON` | Lesson | Character Development |

### `LCategory` — feed filter buckets
| Value | Label |
|---|---|
| `INTERVIEWS` | Interviews |
| `STARTUPS` | Startups |
| `LAYOFFS` | Layoffs |
| `PRODUCTION` | Production |
| `CAREER` | Career |
| `LEARNING` | Learning |

### `Visibility`
`PUBLIC` · `FOLLOWERS` · `PRIVATE`  (anonymity is a separate boolean, see §3)

### `ReactionType`
| Value | Emoji | Label |
|---|---|---|
| `BEEN_THERE` | 💔 | Been There |
| `HELPFUL` | 💡 | Helpful |
| `RESPECT` | 🔥 | Respect |
| `PAIN` | 😂 | Pain |
| `SAVED` | 📌 | Saved |

### `JourneyStatus`
| Value | Dot | Label |
|---|---|---|
| `INTERVIEWING` | 🟡 | Interviewing |
| `BUILDING` | 🔵 | Building |
| `WORKING` | 🟢 | Working |
| `STARTING_UP` | 🟣 | Starting Up |
| `RECOVERING` | 🔴 | Recovering |
| `TAKING_A_BREAK` | ⚫ | Taking a Break |

### `NotificationType`
`RELATED` · `HELPED` · `NEW_FOLLOWER` · `COMMENT`

---

## 3. Object shapes

### `UserSummary` — compact author embedded in cards
```json
{ "id": "01J...", "username": "kartik", "name": "Kartik Gupta", "image": "https://cdn.linkedout.app/...", "status": "BUILDING" }
```

### `UserProfile`
```json
{
  "id": "01J...",
  "username": "kartik",
  "name": "Kartik Gupta",
  "image": "https://cdn.linkedout.app/...",
  "bio": "Building in public. Surviving my Ls.",
  "status": "BUILDING",
  "reputation": {
    "storiesShared": 12, "lessonsShared": 30, "buildersHelped": 184, "lsShared": 47, "collectionsCreated": 5
  },
  "counts": { "followers": 320, "following": 210 },
  "viewer": { "isFollowing": true, "isSelf": false },
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```
> `reputation` is **raw numbers**. Compose the display string yourself as `"{n} {label}"` using labels from `GET /meta/enums` → `reputation` (e.g. `"12 Stories Shared"`). (This corrects the v1.0 contradiction — see FE review #5.)

### `LCard` — an L in feeds and lists
```json
{
  "id": "01J...",
  "title": "Rejected after the final round at Google",
  "storyPreview": "Four rounds in, strong signals, and then...",
  "lessonLearned": "Optimize for signal, not for hope.",
  "type": "STORY",
  "category": "INTERVIEWS",
  "company": "Google",
  "tags": ["interview", "faang"],
  "eventDate": "2026-05-10T00:00:00.000Z",
  "visibility": "PUBLIC",
  "isAnonymous": false,
  "resolvedAt": null,
  "author": { /* UserSummary */ },
  "reactions": { "total": 52, "beenThere": 34, "helpful": 18, "respect": 12, "pain": 3, "saved": 9 },
  "commentCount": 7,
  "viewer": { "reactions": ["BEEN_THERE", "SAVED"], "canEdit": false },
  "createdAt": "2026-05-11T09:00:00.000Z"
}
```
- `author` is **`null` when `isAnonymous` is `true`** — even to the author's own followers. Always handle the null case with an "Anonymous builder" placeholder; never link to a profile.
- `resolvedAt` (FE review #6): only meaningful for `type: "BATTLE"`. `null` = **ongoing**; an ISO timestamp = **resolved**. Non-battle types are always `null`.

### `LDetail` — a single L
Same as `LCard` but with the **full** body and its collections:
```json
{
  "...": "all LCard fields except storyPreview",
  "story": "Four rounds in, strong signals, and then the recruiter went silent...",
  "collections": [ { "id": "01J...", "title": "Google Interview Journey", "slug": "google-interview-journey" } ]
}
```

### `JourneyNode` — one dot on the L Journey timeline (FE review #4)
Leaner than `LCard`; enough to render the timeline and open the L on tap.
```json
{
  "id": "01J...",
  "title": "Rejected after the final round at Google",
  "type": "STORY",
  "category": "INTERVIEWS",
  "company": "Google",
  "eventDate": "2026-05-10T00:00:00.000Z",
  "date": "2026-05-10T00:00:00.000Z",
  "isAnonymous": false,
  "resolvedAt": null,
  "reactionTotal": 52,
  "commentCount": 7
}
```
- `date` = the **effective ordering date** = `eventDate ?? createdAt`, and is always non-null. `eventDate` may be null (kept so you can show "exact date unknown"); order and label off `date`.

### `Comment`
```json
{
  "id": "01J...",
  "body": "I experienced this exact thing at my last job.",
  "author": { /* UserSummary */ },
  "lId": "01J...",
  "parentId": null,
  "replyCount": 3,
  "viewer": { "canDelete": true },
  "createdAt": "2026-05-11T10:00:00.000Z"
}
```

### `Notification`
```json
{
  "id": "01J...",
  "type": "RELATED",
  "actor": { /* UserSummary */ },
  "target": { "lId": "01J...", "title": "Rejected after the final round at Google" },
  "message": "34 builders related to your story.",
  "readAt": null,
  "createdAt": "2026-05-11T11:00:00.000Z"
}
```
> `message` is composed by the backend (outcome-framed). **Display verbatim** — this is the one place the "don't compose copy" rule is strict, because the string encodes aggregation logic.

### `Collection`
```json
{ "id": "01J...", "title": "My Startup Journey", "slug": "my-startup-journey", "owner": { /* UserSummary */ }, "lCount": 8, "createdAt": "2026-02-01T00:00:00.000Z" }
```
`CollectionDetail` adds `"ls": [ /* ordered LCard[] */ ]`.

---

## 4. Endpoints

### 4.1 Auth
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/google` | none | Redirect → Google OAuth. Accepts `?returnTo=`. See §1.1. |
| GET | `/auth/github` | none | Same for GitHub. |
| GET | `/auth/me` | optional | Current session (below). `null` when logged out. |
| POST | `/auth/refresh` | none (refresh cookie) | Rotate the access cookie. |
| POST | `/auth/logout` | required | Clear session cookies. |

**`GET /auth/me`** →
```json
{ "user": { /* UserProfile of self */ }, "needsOnboarding": false }
```
Logged out → `{ "user": null, "needsOnboarding": false }`.

### 4.2 Users & Profiles
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/users/:username` | optional | `UserProfile`. |
| PATCH | `/users/me` | required | Update own profile / finish onboarding. |
| GET | `/users/:username/ls` | optional | User's Ls, filter by `type` — powers profile sections. → `LCard[]` |
| GET | `/users/:username/journey` | optional | Full L Journey timeline. → `JourneyNode[]` |
| GET | `/users/:username/collections` | optional | → `Collection[]` |
| GET | `/users/:username/followers` | optional | → `UserSummary[]` |
| GET | `/users/:username/following` | optional | → `UserSummary[]` |

**`PATCH /users/me`** — body (all optional; send only what changed):
```json
{ "username": "kartik", "name": "Kartik Gupta", "bio": "…", "image": "https://…", "status": "BUILDING" }
```
Limits: `username` 3–30, lowercase `[a-z0-9_]`, required to finish onboarding; `name` 0–80; `bio` 0–280; `image` a URL from §4.9; `status` a `JourneyStatus` or `null`. Returns updated `UserProfile`. Errors: `USERNAME_TAKEN` (409), `USERNAME_INVALID` (422).

**`GET /users/:username/ls`** — `?type=<LType>` (omit for all), `?limit`, `?cursor`. Visibility enforced server-side (non-owners never see `PRIVATE`; `FOLLOWERS`-only shows to followers).

**`GET /users/:username/journey`** (FE review #4) — `?limit` (default 30, max 100), `?cursor`. Returns `JourneyNode[]` ordered by `date` (= `eventDate ?? createdAt`) **ascending (oldest → newest)** — the narrative order in product.md. Paginated (large journeys). Respects visibility like `/ls`.

### 4.3 Ls (core object)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/ls` | required | Create. → `LDetail` (201) |
| GET | `/ls/:id` | optional | → `LDetail`. Respects visibility. |
| PATCH | `/ls/:id` | required (owner) | Edit. |
| DELETE | `/ls/:id` | required (owner) | Delete. |

**`POST /ls`** — body:
```json
{
  "title": "Rejected after the final round at Google",
  "story": "Full story text…",
  "lessonLearned": "Optimize for signal, not hope.",
  "type": "STORY",
  "category": "INTERVIEWS",
  "company": "Google",
  "tags": ["interview", "faang"],
  "eventDate": "2026-05-10",
  "visibility": "PUBLIC",
  "isAnonymous": false
}
```
Limits: `title` 1–140 (required); `story` 1–10000 (required); `lessonLearned` 0–500; `type` default `L`; `company` 0–100; `tags` max 5, each 1–30; `eventDate` ISO date or null; `visibility` default `PUBLIC`; `isAnonymous` default `false`.

**`PATCH /ls/:id`** — same fields, all optional, **plus `resolvedAt`** (FE review #6): send an ISO timestamp to mark a Battle **resolved**, or `null` to reopen it. Owner only, else `NOT_L_OWNER` (403). Returns updated `LDetail`.

### 4.4 Feed
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/feed` | optional | Global feed of public Ls. |
| GET | `/feed/following` | required | Ls from people the viewer follows. |

**Shared query params (both endpoints — FE review #9):** `sort` = `latest` (default) · `trending` · `helpful`; `filter` = one `LCategory` lowercased (`interviews`,`startups`,`layoffs`,`production`,`career`,`learning`) — **single-select** (FE review #14); `limit`; `cursor`. → `LCard[]` with viewer-context when logged in.

### 4.5 Reactions
| Method | Path | Auth | Purpose |
|---|---|---|---|
| PUT | `/ls/:id/reactions/:type` | required | Add. **Idempotent.** |
| DELETE | `/ls/:id/reactions/:type` | required | Remove. **Idempotent** (FE review #12). |

`:type` is a `ReactionType`. Both return **200** with the L's updated summary + viewer state — even if the PUT was a no-op (already reacted) or the DELETE removed nothing:
```json
{ "reactions": { "total": 53, "beenThere": 35, "helpful": 18, "respect": 12, "pain": 3, "saved": 9 }, "viewer": { "reactions": ["BEEN_THERE", "SAVED"] } }
```
Your optimistic toggle never needs to fear an error from double-tap or double-untap.

**Saved list:** `GET /me/saved` (required) → viewer's `SAVED` Ls as `LCard[]` (paginated).

### 4.6 Comments
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/ls/:id/comments` | optional | Top-level comments (paginated). |
| POST | `/ls/:id/comments` | required | Add top-level. → `Comment` |
| GET | `/comments/:id/replies` | optional | Replies (paginated). |
| POST | `/comments/:id/replies` | required | Reply. → `Comment` |
| DELETE | `/comments/:id` | required (author) | Delete own comment. |

Body 1–2000 chars. Threading is one level via `replyCount` + `/replies` (load-more). **Comment editing is intentionally omitted for MVP** (FE review #13) — comments are immutable; users delete and repost.

### 4.7 Follows
| Method | Path | Auth | Purpose |
|---|---|---|---|
| PUT | `/users/:username/follow` | required | Follow. **Idempotent.** |
| DELETE | `/users/:username/follow` | required | Unfollow. **Idempotent.** |

Returns `{ "isFollowing": true, "counts": { "followers": 321, "following": 210 } }` for the target. Self-follow → `VALIDATION_ERROR` (400).

### 4.8 Collections
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/collections` | required | `{ "title": "…" }` (1–80). → `Collection` |
| GET | `/collections/:id` | optional | → `CollectionDetail` (ordered `ls`). |
| PATCH | `/collections/:id` | required (owner) | Rename `{ "title": "…" }`. |
| DELETE | `/collections/:id` | required (owner) | Delete collection (not the Ls). |
| PUT | `/collections/:id/ls/:lId` | required (owner) | Add L (optional `{ "position": 3 }`). **Idempotent.** |
| DELETE | `/collections/:id/ls/:lId` | required (owner) | Remove L from collection. **Idempotent.** |

### 4.9 Media upload — avatars (FE review #8)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/uploads/avatar` | required | Get a presigned upload URL. |

**Request:** `{ "contentType": "image/jpeg", "contentLength": 204800 }`.
**Constraints (validated up front — validate before calling to avoid a silent 403 on the PUT):**
- `contentType` ∈ `image/jpeg`, `image/png`, `image/webp`.
- `contentLength` ≤ **5 MB** (`5242880`).
- Recommended square, ≥ 128×128; the backend downscales to 512×512.

**Response:**
```json
{
  "uploadUrl": "https://<r2-presigned>...",
  "publicUrl": "https://cdn.linkedout.app/avatars/01J....jpg",
  "headers": { "Content-Type": "image/jpeg" },
  "expiresIn": 300
}
```
Flow: `PUT uploadUrl` with the raw bytes and **exactly the `headers` returned** (R2/S3 presigns reject a mismatched `Content-Type`). URL expires in `expiresIn` seconds. Then send `publicUrl` as `image` in `PATCH /users/me`.

### 4.10 Search (FE review #14)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/search` | optional | Full-text search over Ls (or users). |

Params: `q` (required, 1–100); `type` = `ls` (default) · `users`; `filter` = one `LCategory` (**only for `type=ls`**, single-select, optional); `limit`; `cursor`. **Sort is always relevance** (title matches rank highest) — there is no `sort` param on search. → `LCard[]` (ls) or `UserSummary[]` (users), paginated. Only visible content is returned.

### 4.11 Notifications (FE review #10)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/notifications` | required | Paginated `Notification[]`, newest first. |
| GET | `/notifications/unread-count` | required | `{ "count": 4 }`. |
| POST | `/notifications/:id/read` | required | Mark one read. |
| POST | `/notifications/read-all` | required | Mark all read. |

**No realtime for MVP** — no SSE/WebSocket. Poll `unread-count` every **30–60 s** (well within rate limits, §1.8).

### 4.12 Meta & discovery (FE review #5, #11)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/meta/enums` | none | All enum display metadata. Static — fetch once at boot, cache long. |
| GET | `/tags/popular` | none | Tag suggestions for the composer. |

**`GET /meta/enums`** →
```json
{
  "reactionType": [ { "value": "BEEN_THERE", "label": "Been There", "emoji": "💔" }, "…" ],
  "journeyStatus": [ { "value": "BUILDING", "label": "Building", "dot": "🔵" }, "…" ],
  "lType": [ { "value": "STORY", "label": "Story", "sectionLabel": "Stories" }, "…" ],
  "lCategory": [ { "value": "INTERVIEWS", "label": "Interviews" }, "…" ],
  "visibility": [ { "value": "PUBLIC", "label": "Public", "description": "Anyone can see this" }, "…" ],
  "notificationType": [ { "value": "RELATED", "label": "Related" }, "…" ],
  "reputation": [
    { "key": "storiesShared", "label": "Stories Shared" },
    { "key": "lessonsShared", "label": "Lessons Shared" },
    { "key": "buildersHelped", "label": "Builders Helped" },
    { "key": "lsShared", "label": "Ls Shared" },
    { "key": "collectionsCreated", "label": "Collections Created" }
  ]
}
```
Use `lType.sectionLabel` for profile section headers, `lCategory.label` for feed filter chips + the composer, and `reputation[].label` to compose `"{n} {label}"` on the profile.

**`GET /tags/popular`** — `?q=<prefix>` (optional), `?limit` (default 10, max 20) → `{ "tags": [ { "tag": "interview", "count": 240 }, "…" ] }`. Free-text tags still allowed in the composer; this only powers autocomplete.

---

## 5. Guarantees for the frontend

- **Never compute permissions.** Use `viewer.canEdit`, `viewer.canDelete`, `viewer.isFollowing`, `viewer.reactions`.
- **Notification `message` is server-rendered — display verbatim.** This is the only strict "don't compose copy" case. Everything else (reputation, enum labels) you compose from raw values + `/meta/enums` labels.
- **Always handle `author === null`** (anonymous Ls) — "Anonymous builder" placeholder, no profile link.
- **Counts are authoritative & denormalized** — after a reaction/comment/follow mutation, update UI from the mutation response; no refetch needed.
- **Idempotent mutations** (all `PUT`s, and reaction/collection/follow `DELETE`s) — safe to double-fire; they never error on repeat.
- **Cursors are opaque** — store `nextCursor`, pass it back, stop at `null`.
- **On `429`** honor `Retry-After`.

---

## Appendix — v1.1 answers to the frontend review

| # | Topic | Resolution |
|---|---|---|
| 1 | Types source of truth | **Import `@linkedout/contracts` directly** (§0). OpenAPI is fallback only. |
| 2 | OAuth redirect | Full contract in §1.1: `returnTo` param, `${WEB_URL}/auth/callback` target, `?error=<code>` failures, `/auth/me`-driven onboarding routing. |
| 3 | Dev cookies/CORS | §1.2 table. Same-site `localhost` → `SameSite=Lax`, explicit CORS origin + credentials; no `SameSite=None` needed. |
| 4 | Journey shape | New `JourneyNode` (§3) + §4.2: ordered by `date = eventDate ?? createdAt` **ascending**, paginated. |
| 5 | Enum labels + reputation copy | New `GET /meta/enums` (§4.12) with labels/emoji for **all** enums incl. `lType`/`lCategory`; reputation is raw numbers + labels (FE composes). v1.0 contradiction fixed. |
| 6 | Battles / `resolvedAt` | Added to `LCard`/`LDetail`/`JourneyNode`; settable via `PATCH /ls` (§4.3). |
| 7 | `VALIDATION_ERROR.details` | It's an **array** of `{ field, code, message }` with a stable `code` set (§1.7). |
| 8 | Avatar upload | §4.9: content-types, 5 MB cap, `headers` echoed for the PUT, 5-min expiry. |
| 9 | `/feed/following` params | Same `sort`/`filter`/pagination as `/feed` (§4.4). |
| 10 | Notification delivery | Polling only for MVP; 30–60 s (§4.11, §1.8). |
| 11 | Tag autocomplete | `GET /tags/popular` (§4.12). |
| 12 | Idempotent reaction DELETE | Yes — 200 with summary even if absent (§4.5). |
| 13 | Comment editing | Intentionally omitted for MVP (§4.6). |
| 14 | Filter single-select / search | Feed & search filter single-select; search sorts by relevance and accepts a category `filter` (§4.4, §4.10). |

*Live OpenAPI at `/v1/openapi.json` is authoritative on shapes; this doc is the readable companion.*
