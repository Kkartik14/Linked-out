# LinkedOut — Architecture & Build Plan

> "LinkedIn for your Ls." Standalone backend owns all logic; the frontend is a thin client.

## Guiding principles

- **Backend owns everything.** The frontend renders what the API returns and sends user input back. No business logic, no derived state, no permission decisions in the frontend. Even human-facing strings that encode business meaning (e.g. notification copy "34 builders related") are rendered server-side.
- **Strict layering (MCS + DAL).** Every request flows `Controller → Service → Repository → Prisma → Postgres`. A layer only ever calls the layer directly beneath it.
- **DRY across the wire.** Request/response shapes are defined once as **Zod schemas in `packages/contracts`** and consumed by both sides: the backend validates with them (via `nestjs-zod`) and auto-generates OpenAPI; the frontend imports the inferred TypeScript types. One source of truth, zero drift.
- **Boring, scalable defaults** (from the scaling research): plain Postgres on Neon, ULID time-sortable IDs, denormalized counters, fan-out-on-read feeds, Postgres FTS. No sharding, no precomputed timelines, no Redis until load proves it necessary.

---

## Monorepo layout (pnpm workspaces + Turborepo)

```
linkedout/
├── apps/
│   ├── api/                      # NestJS backend — the whole product
│   │   └── src/
│   │       ├── main.ts           # bootstrap, global pipes/filters/CORS/cookies
│   │       ├── app.module.ts
│   │       ├── common/           # cross-cutting: guards, interceptors, filters, decorators
│   │       │   ├── guards/       # JwtAuthGuard, OptionalAuthGuard
│   │       │   ├── interceptors/ # response shaping, logging
│   │       │   ├── filters/      # global exception → error envelope
│   │       │   ├── decorators/   # @CurrentUser(), @Public()
│   │       │   └── pagination/   # opaque cursor encode/decode
│   │       ├── config/           # env schema (zod-validated), typed config
│   │       ├── prisma/           # PrismaModule + PrismaService (ULID client extension)
│   │       └── modules/
│   │           ├── auth/         # OAuth (Google/GitHub), session cookies, refresh
│   │           ├── users/        # profiles, reputation, onboarding
│   │           ├── ls/           # the core object: CRUD
│   │           ├── feed/         # global + following feeds (fan-out-on-read)
│   │           ├── reactions/
│   │           ├── comments/
│   │           ├── follows/
│   │           ├── collections/
│   │           ├── notifications/
│   │           ├── search/       # Postgres full-text search
│   │           ├── uploads/      # presigned R2/S3 avatar upload URLs
│   │           └── meta/         # /meta/enums, /tags/popular (display metadata + discovery)
│   └── web/                      # Next.js frontend (separate team) — dumb client
│
├── packages/
│   ├── contracts/                # ⭐ Zod schemas + inferred TS types + enums. SHARED.
│   ├── db/                       # Prisma schema, migrations, generated client
│   ├── config-eslint/
│   └── config-tsconfig/
│
├── contract.md                   # human-readable API contract (handoff to FE team)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

### Why a separate `contracts` package
It is the DRY seam between the two apps. A new endpoint means: add its Zod request/response schema in `contracts` → the backend `Controller` binds it → the frontend imports the type. Neither side hand-writes the shape twice.

**Types source of truth (confirmed with FE):** `apps/web` depends on `@linkedout/contracts` and imports the inferred TS types directly — zero drift, no codegen step. `/v1/openapi.json` (generated from the same Zod schemas) exists only as a fallback for consumers outside the monorepo. This means `packages/contracts` must be workspace-linked and building before the frontend can typecheck.

---

## The layers, per module (MCS + DAL)

Each feature module (e.g. `ls/`) contains:

| File | Layer | Responsibility | May NOT do |
|---|---|---|---|
| `ls.controller.ts` | **Controller** | HTTP surface only: bind route, validate body/query against the Zod DTO, call the service, return the mapped response. | No business logic, no Prisma. |
| `ls.service.ts` | **Service** (business logic) | Authorization checks, orchestration, transaction boundaries, counter updates, emitting notifications. | No HTTP objects (req/res), no raw SQL/Prisma. |
| `ls.repository.ts` | **Repository** (DAL) | *All* Prisma access. Query building, indexes, cursors. Returns domain entities. | No business rules, no auth checks. |
| `ls.mapper.ts` | **Mapper** | Entity → response DTO. Applies anonymity hiding and viewer-context fields. | No DB access. |
| `dto/` | **Contracts** | Re-exports the request/response Zod schemas from `packages/contracts`. | — |

**Model** = the Prisma models in `packages/db` (the "M" of MCS) + any richer domain types.

### Cross-cutting (in `common/`)
- **Guards** — `JwtAuthGuard` (requires session), `OptionalAuthGuard` (attaches user if present, for viewer-context on public feeds).
- **Global exception filter** — turns every error into the standard error envelope (see contract).
- **Response interceptor** — wraps list responses in the pagination envelope; leaves single resources bare.
- **`@CurrentUser()` decorator** — injects the authenticated user into controllers.
- **Cursor helper** — opaque base64 cursor encode/decode so the frontend never parses it.

---

## Auth model (backend-owned)

1. Frontend links to `GET /v1/auth/google` (or `/github`). Backend runs the OAuth flow via Passport.
2. On callback, backend upserts the `User`, issues an **access token (15 min)** + **refresh token (30 d)** as **httpOnly, Secure, SameSite cookies**, then 302-redirects back to the frontend. The frontend never touches a token.
3. Every API call is made with `credentials: 'include'`. `POST /v1/auth/refresh` silently rotates the access cookie.
4. First-time users have no `username` → `GET /v1/auth/me` returns `needsOnboarding: true` and the frontend routes to an onboarding screen that calls `PATCH /v1/users/me`.

This replaces Auth.js from `product.md` (Auth.js is Next-centric; a standalone backend owns auth instead).

---

## Scaling decisions already baked in

| Concern | MVP decision | Flip-it trigger |
|---|---|---|
| IDs | ULID (time-sortable) via Prisma client extension | never |
| Feed | Global feed = indexed `ORDER BY`; Following feed = fan-out-on-read | read latency hurts at real follow-graph scale |
| Counters | Denormalized on `L` / `User`, updated async in the service layer | never |
| Search | Postgres `tsvector` + GIN | ranking/write load demands Meili/Typesense |
| Cache | None yet; code is look-aside-ready (delete-on-write discipline) | a hot query appears in slow logs → drop in Redis |
| Read scaling | Single primary | CPU sustained >60–70% → add Neon read replica, route reads |
| Sharding | No | effectively never at this stage |

---

## Build sequence

1. **Scaffold** the monorepo: pnpm + Turborepo, `apps/api` (NestJS), `packages/{contracts,db}`. `apps/web` is the frontend team's.
2. **DB layer**: move `schema.prisma` into `packages/db`, add the ULID extension + the raw `tsvector` migration, run `prisma migrate` against Neon.
3. **Auth module**: OAuth + session cookies + `/auth/me` + onboarding. Unblocks everything else.
4. **Vertical slice**: `Create L → Feed → React` end-to-end. Validates the schema and the full layer stack against real queries.
5. Fill out the remaining modules against `contract.md`: comments, follows, collections, notifications, search.
6. Generate the OpenAPI spec from the running app and diff it against `contract.md` to keep them honest.
