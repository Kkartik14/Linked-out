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

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest (unit + component) |
| `pnpm test:e2e` | Playwright (needs `pnpm build` + `pnpm exec playwright install chromium` first) |

## Contract version

The app builds against **v2** (`@linkedout/contracts/v2`, `docs/api-contract-v2.md`), while
the deployed API is still **v1**. That works because v1 responses are a strict superset of
v2's, and v1's strict write schemas accept a v2 body — so the app speaks v2 types to v1
routes until `/v2` ships (contract §5). `API_BASE_URL` therefore stays on `/v1`.

The v2 L has **no `category`, `company`, `tags`, or `eventDate`**, and there is no category
filter or `/tags/popular` route. v1 still sends those fields; the UI ignores them.

Two things are still v1, each with its removal trigger written at the code:

- **`journey-timeline`** imports v1's `JourneyNode`. v2's node needs `createdAt`, which v1
  never sends (it sends the `eventDate ?? createdAt` alias as `date`) *and* orders by that
  alias — so adopting the v2 node today would render a timeline sorted one way and
  labelled another. Migrate when `GET /v2/users/:username/journey` ships.
- **`src/lib/api/fixtures/`** serves `GET /v2/feed/sidebar` locally, because the route is
  not deployed yet. Gated by `NEXT_PUBLIC_FEED_SIDEBAR_FIXTURE=1`; delete the directory,
  the flag, and the branch in `getFeedSidebar` when the route is live.

## Architecture notes

- **Types come from `@linkedout/contracts/v2`** (contract §0) — imported directly,
  never hand-written. It's a `file:` workspace dependency (`../../packages/contracts`).
- **One API seam:** `src/lib/api/` — `client.ts` (credentials, error-envelope
  decoding, 401→refresh→retry with server-side cookie rotation, cursor pagination)
  and `endpoints.ts` (typed calls). All backend traffic flows through here.
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

`GET /v2/feed/sidebar` is one optional-auth aggregate carrying the viewer, people to
follow, Top Ls, and L of the day. The wire does not encode left/right — placement is ours:

- **Left** — viewer box, then People to Follow in its own container.
- **Right** — Top Ls, then L of the day.
- Both rails read one shared principal-scoped query, so they cost a single request.
- **Hidden below `lg`/`xl` rather than stacked.** The centre column is an infinite feed, so
  anything after it is unreachable, and stacking four discovery boxes above it would bury
  the product behind its own sidebar.
- **No polling.** `refreshAfter` becomes a derived `staleTime`; the rails refresh on
  remount and after a follow, never under a reader's eyes.
- The request **fails independently of the feed**: the rails hide, the page stays whole.

## Routes

`/` feed + discovery rails · `/ls/[id]` detail + comments · `/ls/[id]/edit` · `/new` composer ·
`/u/[username]` profile (journey, sections, collections) · `/collections/[id]` ·
`/search` · `/notifications` · `/saved` · `/settings` ·
`/login` · `/auth/callback` · `/onboarding`.
