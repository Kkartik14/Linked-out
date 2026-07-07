# CLAUDE.md — Working rules for this repo

> LinkedOut — "LinkedIn for your Ls." This file is the operating contract for AI/engineering work in this repo. Read it before touching anything.

## 0. Ownership boundaries (do not cross)

This is a shared monorepo. Two teams work in it:

| Path | Owner | Rule |
|---|---|---|
| `apps/web/**` | **Frontend team** | 🚫 **Never modify.** It is a self-contained workspace with its own lockfile. Read-only for coordination. |
| `apps/api/**` | Backend (us) | Our NestJS server. |
| `packages/contracts/**` | Backend (us) | The shared Zod schema/type package (`@linkedout/contracts`). FE consumes it. |
| `packages/db/**` | Backend (us) | Prisma schema, client, migrations. |
| root configs, `docker-compose.yml` | Backend (us) | Root workspace excludes `apps/web` to avoid nested-workspace clashes. |

**The frontend is a dumb client.** All business logic, permissions, derived state, and human-facing "business copy" (notification strings) live in the backend. See `contract.md` (the API contract) and `ARCHITECTURE.md` (the layering plan).

## 1. Type safety — non-negotiable

- **No `any`. No `unknown` as an escape hatch.** Every value has a precise, declared type.
- `tsconfig` runs `strict: true` + `noUncheckedIndexedAccess`. Do not weaken it.
- No `as` casts to silence the compiler except at true system boundaries (e.g. a validated `req.user`), and only after a runtime check.
- All external input (body, query, params) is validated with a **Zod schema from `@linkedout/contracts`** before it reaches a service. The inferred type is the only type the service accepts.
- DB rows are typed by Prisma. Response shapes are typed by `@linkedout/contracts`. Mappers bridge the two — never leak a Prisma entity to the wire.

## 2. Architecture — strict layering (MCS + DAL)

Every request: `Controller → Service → Repository → Prisma`. A layer only calls the one beneath it.

- **Controller** — HTTP only: bind route, validate with the Zod pipe, call service, return mapped DTO. No business logic, no Prisma.
- **Service** — business logic, authorization, orchestration, transactions, counter updates, emitting notifications. No `req`/`res`, no raw Prisma queries.
- **Repository (DAL)** — all Prisma access. Returns domain entities. No auth, no business rules.
- **Mapper** — entity → response DTO. Applies anonymity hiding + viewer-context. No DB access.

Cross-cutting lives in `apps/api/src/common/` (guards, filters, pipes, decorators, pagination).

## 3. Conventions

- **IDs**: ULID (time-sortable), assigned by the Prisma client extension in `@linkedout/db`. Never `autoincrement`, never random UUID.
- **Zod v4** everywhere (matches the frontend's `zod@^4`). Schemas are the single source of truth → inferred TS types → OpenAPI.
- **Pagination**: opaque base64 cursor. Encode/decode only in `common/pagination`.
- **Errors**: throw typed `AppException`s; the global filter renders the `{ error: { code, message, details } }` envelope. `code`s are stable machine strings (see `contract.md §1.7`).
- **Anonymity is server-enforced**: when `isAnonymous`, the mapper sets `author: null` in every response — even to the author's own followers.
- **Idempotent mutations**: all `PUT`s and reaction/follow/collection `DELETE`s never error on repeat.
- **Counters are denormalized** and updated in the same transaction as the write (the "job seam" — kept synchronous for MVP, structured to move to a queue later).
- **Notification `message`** is composed server-side and returned ready to display.

## 4. Contract discipline

- `contract.md` is the source of truth the frontend builds against. **If you change a shape or endpoint, update `contract.md` and `packages/contracts` together** — they must never drift.
- New endpoint = add its Zod request/response schema to `@linkedout/contracts` first, then wire the controller.

## 5. Commands (from repo root)

- `pnpm install` — install api + packages (not web).
- `pnpm db:up` / `pnpm db:down` — Postgres via Docker.
- `pnpm --filter @linkedout/db migrate` — run migrations.
- `pnpm --filter @linkedout/api dev` — run the API on `:4000`.
- `pnpm --filter @linkedout/api typecheck` — must pass with zero errors before done.

## 6. Definition of done

A change is done only when: types pass (`typecheck`), it builds, migrations apply cleanly, and the affected endpoint has been exercised against a real Postgres (not just compiled). No `any`/`unknown`. `contract.md` still matches reality.
