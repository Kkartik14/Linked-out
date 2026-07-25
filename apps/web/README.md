# @linkedout/web

The LinkedOut frontend - "LinkedIn for your Ls." Next.js App Router, a thin client over the `@linkedout/api` backend.

## Stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (components live in `src/components/ui`)
- **TanStack Query** (client caching, infinite scroll, optimistic mutations)
- **react-hook-form** + **Zod** (via the shared `@linkedout/contracts` schemas)
- **Vitest** + Testing Library (unit/component) · **Playwright** (e2e)

## Running

This app is its own pnpm workspace (the backend monorepo root deliberately excludes it).
It talks to the real `@linkedout/api` backend, so start that first (see the repo-root
README / commands), then:

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

### Pick a session mode

`OAUTH_SESSION_MODE` must match on this app and the API. It decides whether this app is *only* a
client or *also* the public BFF in front of a private API.

**`handoff`** - what production, preview, and CI's acceptance job run. The browser talks to this
origin and nothing else; `app/v1/[...path]/route.ts` resolves the `lo_sid` cookie against the
private API and forwards a short-lived assertion.

```dotenv
NEXT_PUBLIC_API_BASE_URL=/v1
OAUTH_SESSION_MODE=handoff
INTERNAL_API_BASE_URL=http://localhost:4000
BFF_CALLER_SECRET=<same value as the API's>
```

**`legacy`** - the browser calls Nest directly with `lo_access`/`lo_refresh`. Retained for the
compatibility window; this app exposes no `/v1` surface in this mode (it answers `404`).

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1
OAUTH_SESSION_MODE=legacy
```

Anything other than the exact string `handoff` resolves to `legacy`, deliberately: an ambiguous
config must never route real traffic through the BFF path. Email sign-in only completes a session
under `handoff`, because it finishes through the same `/auth/callback/handoff` route as OAuth.

> **After the backend rebuilds `@linkedout/contracts`, re-run `pnpm install` here.** pnpm
> materialises the `file:` dependency as a *copy*, not a live symlink, so a rebuilt
> contracts package is invisible to this workspace until you reinstall. The symptom is a
> phantom type error, or a missing export that plainly exists in `packages/contracts`.

> **After the backend adds a migration, run `pnpm --filter @linkedout/db migrate:deploy`.**
> Nothing migrates your dev database automatically, and the API answers a route whose
> tables are behind with a `500` - which reads like a frontend bug and is not one.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest (unit + component) |
| `pnpm test:e2e` | Playwright, **legacy** topology (run `pnpm exec playwright install chromium` once first; the script pins the mode and API base URL itself) |
| `pnpm test:e2e:handoff` | Playwright, **one-origin BFF** acceptance - AUTH-01/02/03/05/06/07/08 |

The two e2e suites cover different session topologies and are not interchangeable; CI runs them as
separate jobs.

## The contract

The app speaks the sole **v1 API**. Runtime types and validation come from
`@linkedout/contracts`; the backend publishes generated OpenAPI at `/v1/openapi.json`.
`NEXT_PUBLIC_API_BASE_URL` carries the `/v1` prefix and there is no second base URL.

The public L contract has **no `category`, `company`, `tags`, or `eventDate`**, there is no category
filter on the feed or search, and `/tags/popular` does not exist.

The accepted L types are **L, Win, Story, Scar, Plot Twist, and Battle**. A profile opens on an
**All** aggregate tab, followed by one tab per type - read from `GET /meta/enums`, never a local
allowlist. There is no Journey or Collections surface. Saved is the sole bookmark destination. On a
self-profile, **Current chapter** appears directly below Edit profile and updates the existing
status field without routing the user through Settings.

### Rejected credentials

Optional-auth reads do **not** downgrade a presented-but-invalid credential to a guest
response - they reject it with `401`. A stale or corrupt cookie therefore fails even
a public read. `getSession()` keeps four states apart: `authenticated`, `guest` (no credential),
`rejected` (one was presented and refused), and `unavailable` (5xx/network - identity unknown, not
absent, so it reaches an error boundary rather than a login redirect).

In **handoff** mode the BFF edge heals this itself: a refused `lo_sid` is answered
`401 SESSION_REJECTED` and cleared at the boundary, and an RSC-only rejection is routed through
`/auth/session/rejected` so the `Set-Cookie` lands on a response the browser actually sees.

In **legacy** mode it cannot. A Server Component has no response boundary on which to clear an
httpOnly cookie, so `src/lib/public-read.ts` sends those viewers to `/login` - the
one recoverable answer that neither pretends the credential is valid nor silently re-fetches as a
guest. That file exists only for the legacy path and is deleted when the legacy cookies retire.

## Architecture notes

- **Types come from `@linkedout/contracts`** - imported directly, never hand-written. It's a
  `file:` workspace dependency (`../../packages/contracts`).
- **Two explicit backend seams:** ordinary application traffic flows through `src/lib/api/` -
  `client.ts` (credentials, error-envelope decoding, request timeouts, and a single-flight
  401→refresh→retry) plus `endpoints.ts` (typed calls and cursor pagination). The separate
  `src/lib/bff/` seam is server-only: it is this app's *BFF* half - caller assertions, CSRF,
  origin validation, session resolution - and never touches browser credentials or client
  components. `session-resolver.ts` is marked `server-only` with a runtime guard behind it.
- **Refresh is legacy-only.** `Set-Cookie` is a forbidden response header and `Cookie` a
  forbidden request header, so no userland code can read or replay a rotation: the browser's
  own cookie jar carries it and `credentials: "include"` puts it on the retry. On the server
  an expired session simply surfaces its `401` - there is no server-side rotation, because a
  Server Component has no response to set cookies on, and `src/lib/public-read.ts`
  is what turns that `401` into navigation. **In handoff mode none of this applies**: `lo_sid` is
  stable for the session's life and slides server-side, so there is nothing to rotate and no
  15-minute boundary - which `AUTH-01` in `e2e/auth-handoff.spec.ts` proves.
- **No client-side business logic:** permissions come from `viewer.*` flags,
  reputation/enum copy from `GET /meta/enums`, and notification strings, suggestion
  reasons and interaction labels are rendered server-side and shown verbatim. Ranked
  lists are rendered in the order the API returned them. Anonymous Ls (`author === null`)
  render an "Anonymous builder" placeholder and never link to a profile.
- **Data fetching:** Server Components fetch initial data; Client Components use
  TanStack Query (seeded with the server page) for load-more + optimistic UI.
- **Query keys** are principal-scoped (`src/lib/query-keys.ts`) so one account's cache is
  never read under another's, and finite/infinite queries over one resource never share a
  key.

### The feed rails

`GET /feed/sidebar` is one optional-auth aggregate carrying the viewer, people to follow,
Top Ls, and L of the day. The wire does not encode left/right - placement is ours:

- **Left** - viewer box (Ls Shared, Followers, Following), Search/Saved navigation, then People to
  Follow in its own container.
- **Right** - Top Ls, then L of the day.
- The same discovery frame is reused by Feed, full Search, and authenticated Saved. A Saved rail
  failure never blocks the bookmark list.
- Both rails read one shared principal-scoped query, so they cost a single request.
- **Hidden below `lg`/`xl` rather than stacked.** The centre column is an infinite feed, so
  anything after it is unreachable, and stacking four discovery boxes above it would bury
  the product behind its own sidebar.
- **No polling.** `refreshAfter` becomes a derived `staleTime`; the rails refresh on
  remount and after a follow, never under a reader's eyes.
- The request **fails independently of the feed**: the rails hide, the page stays whole.

The feed route is three landmarks - two `complementary` rails around a `region` named
"The Feed". The same L can legitimately appear in both the feed and a rail, so anything
addressing "the feed" (a screen reader, a test) needs that name to mean something.

On `/search`, the centre searchbox is the only search input. The header search controls and textual
Feed link are omitted for that route, and an empty query reuses the feed controls/cards without
repeating the Feed heading or subtitle.

## Routes

**Pages.** `/` feed + discovery rails · `/ls/[id]` detail + comments · `/ls/[id]/edit` · `/new`
composer · `/u/[username]` profile (All + type tabs) · `/u/[username]/followers` ·
`/u/[username]/following` · `/search` · `/notifications` · `/saved` · `/settings` ·
`/login` · `/signup` · `/forgot-password` · `/onboarding` · `/auth/callback`.

**Route handlers** (not pages - they exist to put a header or cookie on a response the browser
sees). `/auth/callback/handoff` exchanges a one-time OAuth/email code and sets `lo_sid` ·
`/auth/session/rejected` commits an RSC-detected session tombstone · `/health/bff` liveness ·
`/v1/[...path]` the public BFF for all API traffic · `/v1/auth/logout` tombstone-first logout.
The `/v1/*` handlers answer `404` in legacy mode.
