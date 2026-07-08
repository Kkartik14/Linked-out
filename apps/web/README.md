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

## Scripts

| Command | What |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (flat config) |
| `pnpm test` | Vitest (unit + component) |
| `pnpm test:e2e` | Playwright (needs `pnpm build` + `pnpm exec playwright install chromium` first) |

## Architecture notes

- **Types come from `@linkedout/contracts`** (contract.md §0) — imported directly,
  never hand-written. It's a `file:` workspace dependency (`../../packages/contracts`).
- **One API seam:** `src/lib/api/` — `client.ts` (credentials, error-envelope
  decoding, 401→refresh→retry with server-side cookie rotation, cursor pagination)
  and `endpoints.ts` (typed calls). All backend traffic flows through here.
- **No client-side business logic:** permissions come from `viewer.*` flags,
  reputation/enum copy from `GET /meta/enums`, notification strings rendered
  server-side and shown verbatim. Anonymous Ls (`author === null`) render an
  "Anonymous builder" placeholder and never link to a profile.
- **Data fetching:** Server Components fetch initial data; Client Components use
  TanStack Query (seeded with the server page) for load-more + optimistic UI.

## Routes

`/` feed · `/ls/[id]` detail + comments · `/ls/[id]/edit` · `/new` composer ·
`/u/[username]` profile (journey, sections, collections) · `/collections/[id]` ·
`/search` · `/notifications` · `/saved` · `/settings` ·
`/login` · `/auth/callback` · `/onboarding`.
