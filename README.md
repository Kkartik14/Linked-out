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

Backend workspace:

```bash
pnpm install
pnpm db:up
pnpm migrate
pnpm dev
```

The API runs on `http://localhost:4000/v1` by default.

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

The backend workspace uses explicit pnpm scripts rather than Turborepo. CI builds
`contracts → db → api` once and passes those outputs to the database and end-to-end jobs as a
workflow artifact.

For more frontend details, see `apps/web/README.md`.

Production retention work is exposed as an external job; see
[`docs/operations/maintenance-cleanup.md`](docs/operations/maintenance-cleanup.md) for its
dry-run/apply safety model and scheduling runbook.
