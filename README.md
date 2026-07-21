# LinkedOut

LinkedOut is a full-stack social app for sharing career losses, lessons learned, and professional growth. Think "LinkedIn for your Ls": users can post stories, react, comment, follow people, save collections, search, and manage profiles.

## Stack

- **API:** NestJS, TypeScript, Prisma, PostgreSQL
- **Web:** Next.js App Router, React, Tailwind CSS, TanStack Query
- **Shared:** Zod contracts and shared database package

## Repo Layout

```text
apps/api/          NestJS backend API
apps/web/          Next.js frontend app
packages/contracts Shared Zod schemas and TypeScript types
packages/db        Prisma schema, migrations, seed, and DB client
docker-compose.yml Local PostgreSQL
```

## Run Locally

Use Node.js 22 (pinned in `.node-version`, matching CI) and pnpm 11.10.0.

Backend workspace — **run this block on a fresh clone and again after every `git pull`.** Every
step is idempotent, so it is always safe to re-run, and it keeps your dev database in step with
the migrations you just pulled:

```bash
pnpm install
pnpm db:up                                  # start Postgres (needs the Docker engine running)
pnpm --filter @linkedout/db migrate:deploy  # apply any migrations you just pulled
pnpm build                                  # regenerate the Prisma client + contracts
pnpm dev
```

The sole public API is served at `http://localhost:4000/v1`. The web application and shared
`@linkedout/contracts` package use that same contract; there is no compatibility version alias.

`pnpm db:up` only works if the Docker **engine** is running — an open Docker Desktop window is
not enough. Confirm with `docker info`; if that errors, start Docker and retry. A stale
`~/.docker/run/docker.sock` makes the failure look like a database problem rather than a stopped
engine.

**Do not skip `migrate:deploy`.** It is the most common way to break local dev: the test suites
migrate `linkedout_test`, but nothing migrates your `linkedout` dev database, so it drifts behind
silently while every suite stays green. The API then fails at runtime with errors like
`The column L.popularityScore does not exist in the current database`.

Use `pnpm migrate` (`prisma migrate dev`) **only when authoring a new migration.** It diffs
`schema.prisma` against the database and can generate new migrations or prompt for a reset —
and because several objects are owned by raw SQL rather than `schema.prisma` (the `searchVector`
generated column, the FTS/trigram/partial indexes, and the `Follow` counter triggers), it can
propose dropping them. To catch an existing database up, always use `migrate:deploy`.

Frontend workspace:

```bash
cd apps/web
pnpm install
pnpm dev
```

The web app runs on `http://localhost:3000` and expects `NEXT_PUBLIC_API_BASE_URL` to point at the API.

## Useful Commands

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm --dir apps/web typecheck
pnpm --dir apps/web test
```

## Deploying on Vercel

Production is two Vercel projects connected to this GitHub repository. A push to `main` deploys
both projects automatically; Vercel skips a project when neither it nor one of its workspace
dependencies changed.

| Project | Root directory | Runtime region | Public URL |
|---|---|---|---|
| `linked-out-api` | `apps/api` | Singapore (`sin1`) | `https://linked-out-api.vercel.app` |
| `linked-out-fe` | `apps/web` | Singapore (`sin1`) | `https://linked-out-fe.vercel.app` |

The API project uses the root workspace build. The web project first builds and installs its
`file:` shared packages through `pnpm vercel:install:web`, then runs the Next production build.
Both projects enable Corepack and use the repository-pinned pnpm version.

### Branch-paired previews

The two `vercel.json` files declare each other as Vercel Related Projects. A Git push to a preview
branch deploys both apps from the same commit. At runtime, the web BFF discovers that branch's API
host and Nest discovers that branch's web host, producing an exact pair:

```text
feature branch web /v1 → same feature branch API
```

The browser still uses `NEXT_PUBLIC_API_BASE_URL=/v1`; it never calls the Nest preview directly.
Vercel injects `VERCEL_RELATED_PROJECTS`, `VERCEL_BRANCH_URL`, and `VERCEL_ENV`, while the explicit
production origins below remain fallbacks. Related Projects applies to Git-triggered deployments,
not ad-hoc CLI deployments.

Protected previews require two project-scoped automation credentials. Enable Protection Bypass for
Automation on the web project so Vercel injects `VERCEL_AUTOMATION_BYPASS_SECRET`; Server Components
use it only when self-hopping through the protected web `/v1` route. Copy a separate API project
bypass into the web project's Preview-only `INTERNAL_API_BYPASS_SECRET`; the BFF uses it only on its
private upstream hop. Both boundaries strip client-supplied bypass headers before applying their
server-only value. Leave the corresponding credential unset when that project's previews are
public.

Arbitrary preview hostnames are normally not registered OAuth callbacks. Use a stable staging
branch/domain for real Google/GitHub login testing; ordinary branch previews still pair correctly
for public reads and any session fixture used by automated acceptance tests.

By explicit product decision, Preview and Production currently share the same PostgreSQL database.
This is acceptable only while the production database is disposable and empty. Treat every schema
migration and destructive data operation from a feature branch as production-impacting. Split
Preview onto a staging or per-branch database before real user data exists.

Both projects still need Preview-scoped environment variables. At minimum, the web needs
`NEXT_PUBLIC_API_BASE_URL=/v1`, `OAUTH_SESSION_MODE=handoff`, and the shared
`BFF_CALLER_SECRET`. The API currently uses the same database URLs as Production, distinct
Preview-only JWT/internal assertion secrets, the same `BFF_CALLER_SECRET`,
`OAUTH_SESSION_MODE=handoff`, and `TRUST_PROXY_HOPS`. Related Projects supplies the paired origins,
so production `WEB_URL`/`API_BASE_URL` values remain only fail-closed fallbacks. OAuth, R2, and
`COOKIE_DOMAIN` may be left unset for arbitrary previews; use a stable staging environment when
those integrations must be exercised.

Set the API production environment from `.env.example`, using Neon pooled/direct URLs and
`OAUTH_SESSION_MODE=handoff`. Set the web production environment from `apps/web/.env.example` with:

```dotenv
NEXT_PUBLIC_API_BASE_URL=/v1
OAUTH_SESSION_MODE=handoff
WEB_URL=https://linked-out-fe.vercel.app
INTERNAL_API_BASE_URL=https://linked-out-api.vercel.app
BFF_CALLER_SECRET=<same purpose-scoped value as the API project>
```

Register both OAuth providers against the public BFF callback routes:

```text
https://linked-out-fe.vercel.app/v1/auth/google/callback
https://linked-out-fe.vercel.app/v1/auth/github/callback
```

Never run Prisma migrations during Nest function startup: cold starts can overlap. Apply a reviewed
migration once, before deploying the code that requires it:

```bash
vercel env run --environment production --project linked-out-api -- pnpm --filter @linkedout/db migrate:deploy
```

The same production environment can run the bounded retention job explicitly with
`pnpm maintenance:cleanup`. Secrets stay in Vercel; local production env exports remain ignored.

The development seed deletes all application data. It therefore refuses to connect unless
the target is a loopback database with an allowlisted name and the expected login role is
explicitly pinned:

```bash
ALLOW_DB_SEED=1 SEED_DB_EXPECTED_SESSION_USER=linkedout pnpm --filter @linkedout/db seed
```

`SEED_DB_ALLOWED_NAMES` defaults to `linkedout,linkedout_dev`; remote seeding is deliberately
unsupported.

The backend workspace uses explicit pnpm scripts rather than Turborepo. CI builds
`contracts → db → api` once and passes those outputs to the database and end-to-end jobs as a
workflow artifact.

For more frontend details, see `apps/web/README.md`.

Production retention work is exposed as the external `pnpm maintenance:cleanup` job. Database
expiry cleanup runs by default, while avatar deletion is dry-run unless `--apply-assets` is passed.
Use `pnpm maintenance:cleanup --help` for the bounded scan/apply options; operational design notes
are kept in the ignored local documentation set.
