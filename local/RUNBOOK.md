# LinkedOut — Local Run & End-to-End Guide

Current for the Parts 6–8 candidate for backend/frontend 1.1.4. The web application and API share
one v1 contract; the release version remains unchanged until Parts 1–5 are integrated.

## Prerequisites

- Docker Desktop with the Docker engine running
- Node 22 (the version pinned by `.node-version` and CI)
- pnpm 11.10.0

## 1. Start the backend

Local environment files already provide the development database URL and JWT secrets. Add at least
one OAuth provider to `apps/api/.env` for interactive login.

### GitHub OAuth

1. Create an OAuth App at <https://github.com/settings/developers>.
2. Homepage URL: `http://localhost:3000`
3. Callback URL: `http://localhost:4000/v1/auth/github/callback`
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `apps/api/.env`.

### Google OAuth

Create a web OAuth client with callback
`http://localhost:4000/v1/auth/google/callback`, then set `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET`.

An unconfigured provider returns `503 PROVIDER_NOT_CONFIGURED`; the API still boots.

### Email and password (feature 1.1.3)

The local env files already set `EMAIL_DELIVERY_MODE=stub` plus `EMAIL_OTP_PEPPER`,
`EMAIL_OTP_ENCRYPTION_KEY`, and `EMAIL_OTP_INSPECTION_SECRET`, so email sign-in needs no external
provider. The startup block below runs `migrate:deploy`; an **existing** dev database also needs it
for the new email tables, or signup returns `500`. There is no real email — read the delivered code
from the protected stub inspector:

```bash
B=http://localhost:4000/v1
S=$(grep EMAIL_OTP_INSPECTION_SECRET .env | cut -d= -f2)
# Signup carries only the email; the password is authored later, at /verify, with the code.
curl -s -X POST "$B/auth/email/signup" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
curl -s -X POST "$B/auth/email/otp/inspect" -H 'Content-Type: application/json' \
  -H "X-LinkedOut-OTP-Inspection: $S" \
  -d '{"email":"you@example.com","purpose":"SIGNUP"}' | jq '.otp'
# Then POST /auth/email/verify {email, otp, password, returnTo} to set the password and sign in.
```

`verify` and `login` return the OAuth session handoff, so — exactly like OAuth below — they complete
a browser session only under `OAUTH_SESSION_MODE=handoff`. In the default `legacy` mode the signup
and OTP-entry screens work end to end, but the final `/auth/callback/handoff` step is inert. The
contract is `docs/api-contract-v1.md` §0.1.

Keep `OAUTH_SESSION_MODE=legacy` for the runnable browser application. The backend handoff,
session-resolve, and session-revoke endpoints are implemented, but the public Next BFF handlers
that exchange the code and set `lo_sid` are not. Enabling `handoff` before that cutover makes the
browser return from OAuth without a usable session.

From the repository root:

```bash
pnpm install
pnpm db:up
pnpm --filter @linkedout/db migrate:deploy
pnpm build
pnpm dev
```

The API serves its sole public surface at `http://localhost:4000/v1`.

Optional development seed (destructive to local application data and deliberately guarded):

```bash
ALLOW_DB_SEED=1 SEED_DB_EXPECTED_SESSION_USER=linkedout pnpm --filter @linkedout/db seed
```

Sanity checks:

```bash
curl -s http://localhost:4000/v1/meta/enums | jq '.lType | length'
curl -s http://localhost:4000/v1/feed | jq '.data | length'
curl -s http://localhost:4000/v1/feed/sidebar | jq '.contractVersion'
```

## 2. Start the frontend

`apps/web` is a separate workspace. Reinstall it after rebuilding shared contracts because its
`file:` dependency is materialized as a copy.

```bash
cd apps/web
pnpm install
```

Set `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/v1
```

Then start Next.js:

```bash
pnpm dev
```

Open `http://localhost:3000`. Browser requests use `credentials: 'include'`; localhost ports are
same-site, so the development `SameSite=Lax` cookies work without HTTPS.

## 3. Browser smoke flow

1. Open `/`; the public v1 feed and discovery rails work signed out.
2. Sign in with GitHub or Google, or create an account with email and password on `/signup` (the
   OTP-entry step needs the stub inspector from §1). The backend returns to `/auth/callback`.
3. On first login, choose a username on `/onboarding`.
4. Create an L with title, story, type, visibility, and optional anonymity.
5. Exercise Latest, Most Popular, and Most Helpful feed sorts.
6. Check People to Follow, Top Ls, and L of the day in the feed rails.
7. React, save, comment, reply, and delete your own comment.
8. Follow a seeded user and switch to the Following feed.
9. Search Ls and users; verify profiles default to L and expose exactly six type tabs.
10. On your profile, change and clear Current chapter below Edit profile; verify Settings has no
    duplicate status control.
11. Save an L and verify it appears in Saved, the sole bookmark destination.
12. Trigger and read reaction/comment/follow notifications.

The public API intentionally has no L category, company, tags, event date, category feed/search filter, or
popular-tags endpoint.

## 4. API-only smoke

Public v1 reads:

```bash
B=http://localhost:4000/v1
curl -s "$B/feed?sort=popular" | jq '.data[].title'
curl -s "$B/users/kartik" | jq '.reputation'
curl -s "$B/search?q=google&type=ls" | jq '.data[].title'
curl -s "$B/users/kartik/ls?type=L" | jq '.data[].createdAt'
curl -s "$B/feed/sidebar" | jq '{viewer, peopleToFollow, topLs, lOfTheDay}'
```

Authenticated paths require the httpOnly session cookies. Use the browser for the normal flow, or
copy `lo_access` from the browser's cookie storage for a short API smoke:

```bash
curl -s -b "lo_access=<value>" "$B/auth/me" | jq
curl -s -b "lo_access=<value>" -X PUT "$B/ls/<lId>/reactions/HELPFUL" | jq '.reactions'
```

## 5. Verification commands

```bash
pnpm typecheck
pnpm lint
pnpm test:api
pnpm --dir apps/web typecheck
pnpm --dir apps/web lint
pnpm --dir apps/web test
```

Real-Postgres integration and browser suites use guarded destructive test-database setup:

```bash
pnpm test:integration
pnpm test:e2e
pnpm --dir apps/web test:e2e:handoff
```

## 6. Maintenance cleanup

Build first, then run the default database cleanup plus avatar dry-run:

```bash
pnpm build
pnpm maintenance:cleanup
```

Only use `--apply-assets` after reviewing the report and confirming identity drift is zero. The
complete safety and pagination procedure is in `docs/operations/maintenance-cleanup.md` relative to
this local documentation directory.

## 7. Troubleshooting

- `PROVIDER_NOT_CONFIGURED`: add that provider's OAuth credentials and restart the API.
- Port 4000 busy: stop the existing API process before restarting.
- CORS/cookies: confirm the frontend uses the exact v1 base URL and `WEB_URL` is
  `http://localhost:3000`.
- Runtime missing-column error: run `pnpm --filter @linkedout/db migrate:deploy`; tests migrate the
  test database, not the development database.
- Phantom web contract type error: rebuild the backend contracts, then rerun `pnpm install` inside
  `apps/web`.
- Docker error: verify the Docker engine with `docker info`, then rerun `pnpm db:up`.

To stop PostgreSQL while retaining its data:

```bash
pnpm db:down
```
