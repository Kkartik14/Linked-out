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
