# @linkedout/web

The LinkedOut frontend — "LinkedIn for your Ls." Next.js App Router, a thin client over the `@linkedout/api` backend.

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
pnpm dev            # http://localhost:3000  (expects the API at NEXT_PUBLIC_API_BASE_URL)
```

Point `NEXT_PUBLIC_API_BASE_URL` (in `.env.local`) at your API — default `http://localhost:4000/v1`.

> **After the backend rebuilds `@linkedout/contracts`, re-run `pnpm install` here.** pnpm
> materialises the `file:` dependency as a *copy*, not a live symlink, so a rebuilt
> contracts package is invisible to this workspace until you reinstall. The symptom is a
> phantom type error, or a missing export that plainly exists in `packages/contracts`.

> **After the backend adds a migration, run `pnpm --filter @linkedout/db migrate:deploy`.**
> Nothing migrates your dev database automatically, and the API answers a route whose
> tables are behind with a `500` — which reads like a frontend bug and is not one.

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest (unit + component) |
| `pnpm test:e2e` | Playwright (run `pnpm exec playwright install chromium` once first; the script builds with the e2e API base URL itself) |

## The contract

The app speaks the sole **v1 API**. Runtime types and validation come from
`@linkedout/contracts`; the backend publishes generated OpenAPI at `/v1/openapi.json`.
`NEXT_PUBLIC_API_BASE_URL` carries the `/v1` prefix and there is no second base URL.

The public L contract has **no `category`, `company`, `tags`, or `eventDate`**, there is no category
filter on the feed or search, and `/tags/popular` does not exist. `JourneyNode` carries
`createdAt` and the journey is ordered by `(createdAt, id)`.

### Rejected credentials

Optional-auth reads do **not** downgrade a presented-but-invalid credential to a guest
response — they reject it with `401` (contract §2). A stale or corrupt `lo_access` cookie
therefore fails even a public read.

The frontend cannot clear an httpOnly cookie from a Server Component (there is no routing
boundary to set a response header — ADR 0001 §1.1), so it cannot heal the session itself.
`src/lib/public-read.ts` sends those viewers to `/login`, which is the one recoverable
answer that neither pretends the credential is valid nor silently re-fetches as a guest.
Delete it when the BFF/session boundary lands and a broken session is cleared at the edge.

## Architecture notes

- **Types come from `@linkedout/contracts`** (contract §0) — imported directly,
  never hand-written. It's a `file:` workspace dependency (`../../packages/contracts`).
- **Two explicit backend seams:** ordinary application traffic flows through `src/lib/api/` —
  `client.ts` (credentials, error-envelope decoding, request timeouts, and a single-flight
  401→refresh→retry) plus `endpoints.ts` (typed calls and cursor pagination). The separate
  `src/lib/bff/` seam is server-only lifecycle traffic from the future public BFF to private Nest;
  it uses purpose-scoped caller assertions, never browser credentials or client components.
- **Refresh is browser-only.** `Set-Cookie` is a forbidden response header and `Cookie` a
  forbidden request header, so no userland code can read or replay a rotation: the browser's
  own cookie jar carries it and `credentials: "include"` puts it on the retry. On the server
  an expired session simply surfaces its `401` — there is no server-side rotation, because a
  Server Component has no response to set cookies on (ADR 0001 §1.1). `src/lib/public-read.ts`
  is what turns that `401` into navigation; `AUTH-01` in `e2e/auth-settings.spec.ts` is
  `test.fixme` pending the BFF/session boundary.
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
Top Ls, and L of the day. The wire does not encode left/right — placement is ours:

- **Left** — viewer box (Ls Shared, Followers, Following), Search/Saved navigation, then People to
  Follow in its own container.
- **Right** — Top Ls, then L of the day.
- The same discovery frame is reused by Feed, full Search, and authenticated Saved. A Saved rail
  failure never blocks the bookmark list.
- Both rails read one shared principal-scoped query, so they cost a single request.
- **Hidden below `lg`/`xl` rather than stacked.** The centre column is an infinite feed, so
  anything after it is unreachable, and stacking four discovery boxes above it would bury
  the product behind its own sidebar.
- **No polling.** `refreshAfter` becomes a derived `staleTime`; the rails refresh on
  remount and after a follow, never under a reader's eyes.
- The request **fails independently of the feed**: the rails hide, the page stays whole.

The feed route is three landmarks — two `complementary` rails around a `region` named
"The Feed". The same L can legitimately appear in both the feed and a rail, so anything
addressing "the feed" (a screen reader, a test) needs that name to mean something.

On `/search`, the centre searchbox is the only search input. The header search controls and textual
Feed link are omitted for that route, and an empty query reuses the feed controls/cards without
repeating the Feed heading or subtitle.

## Routes

`/` feed + discovery rails · `/ls/[id]` detail + comments · `/ls/[id]/edit` · `/new` composer ·
`/u/[username]` profile (journey, sections, collections) · `/collections/[id]` ·
`/search` · `/notifications` · `/saved` · `/settings` ·
`/login` · `/auth/callback` · `/onboarding`.
