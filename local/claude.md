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

**The frontend is a thin client.** Business policy, permissions, derived wire state, ranking, and
API business copy (notifications, suggestion reasons, interaction labels) live in the backend.
The frontend still owns presentation copy; its OAuth-error table and Top-Ls date caption are marked
contract follow-ups. See `contract.md` and `docs/api-contract-v1.md` for the sole public v1, and
`ARCHITECTURE.md` for the current architecture.

## 0.1 Product decisions require Kartik's approval

**Always ask Kartik before making or changing a product decision. Never silently convert an
industry recommendation, security guideline, framework default, or engineering preference into
LinkedOut product policy.** Explain the available options, recommend one with concrete tradeoffs,
and wait for Kartik's explicit choice before implementing it.

Product decisions include, but are not limited to: user-visible flows and copy; feature scope;
names and terminology; validation rules and limits; defaults; ranking and recommendation behavior;
permissions, privacy, visibility, moderation, retention, notification, authentication, and account
recovery policies; destructive migrations; and behavior that changes what a user can do or see.

If Kartik's choice differs from current best practice, state the risk plainly and offer a safer
alternative, but do not override his decision. Ordinary technical choices that preserve already
approved behavior may proceed without another question. If it is unclear whether a choice is
product or implementation, treat it as a product decision and ask.

## 1. Type safety — non-negotiable

- **No `any`. No `unknown` as an escape hatch.** Every value has a precise, declared type.
- `tsconfig` runs `strict: true` + `noUncheckedIndexedAccess`. Do not weaken it.
- No `as` casts to silence the compiler except at true system boundaries (e.g. a validated `req.user`), and only after a runtime check.
- Contract-defined request bodies and query objects are validated with **Zod schemas from
  `@linkedout/contracts`** before reaching a service. CONTRACT-01A and CONTRACT-01B are complete:
  mutation bodies and documented public query objects are strict. Path parameters use a Zod
  pipe where the route contract requires one; do not broaden the claim beyond the routes that
  enforce it.
- DB rows are typed by Prisma. Response shapes are typed by `@linkedout/contracts`. Mappers bridge the two — never leak a Prisma entity to the wire.

## 2. Architecture — strict layering (MCS + DAL)

Normal vertical flow is `Controller → Service → Repository → Prisma`. A service may call another
module's exported service for cross-feature policy (for example comments → L visibility and follows
→ user resolution); controllers and services still never bypass into another module's repository.

- **Controller** — HTTP only: bind route, validate with the Zod pipe, call service, return mapped DTO. No business logic, no Prisma.
- **Service** — business logic, authorization, orchestration, and domain write plans. No `req`/`res`, no raw Prisma queries.
- **Repository (DAL)** — all Prisma access and atomic execution of service-decided write plans. Returns domain entities. No HTTP or authorization policy.
- **Mapper** — entity → response DTO. Applies anonymity hiding + viewer-context. No DB access.

Cross-cutting lives in `apps/api/src/common/` (guards, filters, pipes, decorators, pagination).

## 3. Conventions

- **IDs**: ULID (time-sortable), assigned by the Prisma client extension in `@linkedout/db`. Never `autoincrement`, never random UUID.
- **Zod v4** everywhere (matches the frontend's `zod@^4`). Schemas are the single source of truth → inferred TS types → OpenAPI.
- **Pagination**: opaque base64 cursor. Encode/decode only in `common/pagination`.
- **Errors**: throw typed `AppException`s; the global filter renders the `{ error: { code, message, details } }` envelope. `code`s are stable machine strings (see `contract.md §1.7`).
- **Anonymity is server-enforced**: when `isAnonymous`, the mapper sets `author: null` in every response — even to the author's own followers.
- **Idempotent mutations**: all `PUT`s and reaction/follow `DELETE`s never error on repeat.
- **Counters are denormalized** and updated in the same transaction as the write (the "job seam" — kept synchronous for MVP, structured to move to a queue later).
- **Notification `message`** is composed server-side and returned ready to display.

## 4. Contract discipline

- `contract.md` and `docs/api-contract-v1.md` describe the sole public v1; the root
  `@linkedout/contracts` export is its executable authority. **If you change a public shape or
  endpoint, update all three together** — they must never drift.
- Do not reintroduce removed compatibility fields or add another version alias.
- New endpoint = add its Zod request/response schema to `@linkedout/contracts` first, then wire the controller.

## 5. Commands (from repo root)

- `pnpm install` — install api + packages (not web).
- `pnpm db:up` / `pnpm db:down` — Postgres via Docker.
- `pnpm --filter @linkedout/db migrate:deploy` — apply existing migrations.
- `pnpm migrate` — author a new migration with Prisma migrate dev.
- `pnpm --filter @linkedout/api dev` — run the API on `:4000`.
- `pnpm --filter @linkedout/api typecheck` — must pass with zero errors before done.

## 6. Definition of done

A change is done only when: types pass (`typecheck`), it builds, migrations apply cleanly, and the affected endpoint has been exercised against a real Postgres (not just compiled). No `any`/`unknown`. The v1 contract still matches reality, and a user-visible backend change is recorded in `apps/api/CHANGELOG.md`.
