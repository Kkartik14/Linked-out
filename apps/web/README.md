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

```bash
pnpm install
pnpm dev            # http://localhost:3000
```

### Mock mode (default)

`NEXT_PUBLIC_USE_MOCKS=1` (in `.env.local`) serves realistic fixtures from
`src/lib/api/mocks/`, so the whole UI runs with **no backend**. Flip it to `0`
once `apps/api` is up to hit the real API — no code changes:

```bash
# .env.local
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1
NEXT_PUBLIC_USE_MOCKS=0
```

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
  decoding, 401→refresh→retry, cursor pagination), `endpoints.ts` (typed calls),
  and `mocks/` (fixtures + router, code-split out of prod builds).
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
