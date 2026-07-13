# ADR 0001 — Auth session & cookie topology

- **Status:** Proposed (decision recorded; implementation deferred to the auth epic)
- **Date:** 2026-07-11
- **Owners:** Backend + Frontend
- **Related findings:** AUTH-01..08, CONTRACT-10, FRONTEND-24 (see `issues_spotted_by_codex.md`)

> This ADR must be accepted **before** the auth implementation epic. The acceptance criteria
> in §6 describe the target behavior; **most are not yet encoded** — only a placeholder
> `test.fixme` and two interim `todo`s exist today (see §6 for the per-criterion status). They
> are authored as the epic delivers each piece.

## 1. Context — what is broken today

### 1.1 The 30-day session dies at 15 minutes (AUTH-01)
- The access JWT `exp` and the `lo_access` cookie `Max-Age` are **both exactly 15 min**,
  set together (`apps/api/src/modules/auth/token.service.ts`). So the cookie is *gone* at
  the moment the token would expire — the API almost never sees an *expired* token, it sees
  **no token**, which yields `UNAUTHENTICATED`, not `TOKEN_EXPIRED`.
- The frontend refresh path only triggers on `code === "TOKEN_EXPIRED"` and only in the
  browser (`apps/web/src/lib/api/client.ts` — `typeof window !== "undefined"`). Therefore
  **the refresh mechanism is effectively unreachable** on normal expiry, on both client and
  server. After ~15 min idle the user appears logged out, and `/saved`, `/new`, `/settings`,
  `/notifications` redirect to `/login` on a live 30-day session.
- There is no `middleware.ts` (verified), so a Server Component cannot refresh + persist a
  rotated cookie to the browser response.

### 1.2 Logout can't revoke after expiry (AUTH-02)
`POST /auth/logout` is behind `JwtAuthGuard`. Once `lo_access` is gone the UI looks
anonymous *and* logout 401s, so the still-valid 30-day refresh session cannot be revoked.

### 1.3 Refresh has no single-flight; rotation races (AUTH-05)
Refresh tokens rotate on every `/auth/refresh`. Concurrent expired requests each call
refresh independently; the first rotates the token, later callers replay the now-stale
token and fail. No shared in-flight promise exists.

### 1.4 Infra errors masquerade as logout (AUTH-06)
`OptionalAuthGuard` discards the error arg, and `getSession()` swallows every `/auth/me`
failure to `{ user: null }`. A DB/JWT/API outage renders as a legitimate-looking anonymous
session instead of an observable error.

### 1.5 Cross-origin cookie & CSRF exposure (AUTH-04, AUTH-07, AUTH-08)
- Cookies use `SameSite=Lax`. **Sibling subdomains are same-site**, so under the documented
  production cookie `Domain=.linkedout.app`, a `POST` from a sibling origin (e.g. a
  compromised `cdn.linkedout.app`) **does** carry the auth cookies — CORS is not CSRF
  protection. (Corrected from an earlier downgrade: this is P1-Conditional, gated on the
  multi-subdomain prod topology, not merely low-priority.)
- Server Components forward **every** incoming cookie (including the refresh token) to the
  API on every data call (`client.ts serverCookieHeader`).
- No `Cache-Control` is set on viewer-dependent responses; a shared proxy/CDN could
  cross-serve identities.

### 1.6 Cross-tab identity confusion (FRONTEND-24, AUTH-03)
The browser QueryClient is a per-tab singleton and session context is a passive server
snapshot. Logging in as B in tab 2 replaces the shared cookies; tab 1 still shows A and
holds A's private cache, and a stale submit executes under B. This is a **P1** integrity/
privacy issue (Alice's stale form mutates Bob's account; Alice's private cache lingers) —
not merely UI staleness.

## 2. Decision drivers

- A real browser must stay authenticated for the full 30-day session window.
- No-credential / expired-credential / invalid-credential / infrastructure-failure must
  stay **distinguishable** (never all collapse to "logged out").
- Any session cookie the design sets/updates must land on the **outer browser response** the
  browser sees, not just an internal retry.
- No user credential/token may be forwarded to ordinary data endpoints or the browser.
- Keep the modular monolith; do not add Redis/microservices for this.

## 3. Options considered

| Option | Summary | Verdict |
|---|---|---|
| **A. Patch only the `TOKEN_EXPIRED` check** in `client.ts` | Also refresh on missing-cookie / `UNAUTHENTICATED`. | **Rejected.** Server Components still can't persist rotated cookies; races remain; refresh token still forwarded everywhere; `middleware.ts` is deprecated in the installed **Next 16.2.10** (convention is `proxy.ts`), and Next warns against depending on Proxy globals, so an in-memory single-flight promise is unreliable across instances. A one-line patch hides the structural problem. |
| **B. Refresh inside RSC fetch** | On a 401 in a Server Component, call refresh and retry. | **Rejected.** Rotates the DB token and retries internally **without** forwarding `Set-Cookie` to the browser — leaving the browser holding an invalidated refresh token. Explicitly called out as a trap. |
| **C. One-origin BFF / session boundary** (recommended) | The browser talks to **one public origin** (the Next app / a thin BFF). That boundary owns a host-only opaque session cookie set at a response boundary the browser sees, keeps session state server-side, and calls the private Nest API with a scoped credential. | **Accepted.** The only option that satisfies all drivers. |

## 4. Decision

Adopt **Option C: a one-origin BFF/session boundary.**

```
Browser ─────────────▶ one public web origin (Next app / BFF, owns host-only cookies)
   ▲  Set-Cookie on the outer response            │  scoped internal credential
   └───────────────────────────────────────────────▼
                                            private Nest API ──▶ PostgreSQL
```

### 4.1 The response boundary + the session model — ONE choice

**Decision: a Next `proxy.ts` at the single public web origin, backed by a server-side session
store.** `proxy.ts` (the Next 16.2.10 successor to the deprecated `middleware.ts`) is the
**routing** boundary — it runs on every request (RSC and client) to route/rewrite and do
optimistic gating. It does **not** refresh or set cookies. The **BFF route handlers** for
`/auth/*` (OAuth start/callback relay, code exchange, logout) are what set/clear the cookie on a
response the browser sees. The public origin is the single ingress for **all** `/v1/*` traffic,
including OAuth (§4.3).

**Crucially, the browser holds ONE opaque, host-only cookie (`lo_sid`) that never changes for
the life of the session.** A server-side **session store** (a Postgres table — no Redis
required) has a row with an internal id **`sid`** and fields `{ sub, createdAt, lastUsedAt,
revokedAt? }`. `lo_sid` is a *separate* random opaque token stored **hashed** on that row (so a
store leak isn't a cookie); it maps to the row but is **not** the `sid` the assertion carries
(§4.2). There are **no rotating Nest access/refresh tokens** in this design (see §4.2): the store
row *is* the session, and the BFF derives a short-lived per-request assertion from it.

**Division of labor — honoring Next's warning against Proxy-managed sessions**
(`next/dist/docs/01-app/01-getting-started/16-proxy.md`):

- **`proxy.ts` is thin** — routing + *optimistic* gating only. It inspects the mere presence of
  the `lo_sid` cookie to redirect obviously-unauthenticated navigations away from protected
  page routes, and rewrites `/v1/*` to the BFF handler. It does **no** DB lookup, locking, or
  refresh, and holds no session state.
- **A BFF route handler / server auth service** (`app/v1/[...path]/route.ts`, plus the `/auth/*`
  handlers) is the session authority: it reads `lo_sid`, looks up + slides the store row, mints
  the assertion, and fetches the private Nest API. **The store — not Proxy globals — is the
  source of truth.**

### 4.2 Browser → BFF → Nest credential protocol

- The **browser sends only `lo_sid`** to the public origin; it never sees a Nest credential.
- For each upstream call, the **BFF handler** (not `proxy.ts`) looks up the session and mints a
  **short-lived (≤60 s) service assertion** — a JWT signed with a dedicated `INTERNAL_API_SECRET`
  (separate from every other secret), carrying `{ sub, sid, iss: "bff", aud: "api", exp }` in
  `X-Internal-Auth`. **This assertion is the authoritative identity.** Nest holds no user
  access/refresh token of its own to cross-check — there simply is no Nest user token in this
  model; a valid assertion *is* the credential.
- **Nest rejects spoofed internals** via (a) network isolation — the API origin is not publicly
  routable — **and** (b) a guard that verifies the assertion signature / `iss` / `aud` /
  freshness before business logic. Both must hold; either alone is insufficient.
- **Ordinary `/v1` routing:** the browser calls `/v1/*` on the **public** origin; the BFF
  handler authenticates `lo_sid`, injects `X-Internal-Auth`, and **rewrites** to the private
  Nest origin. There is no direct browser→Nest path.
- **Anonymous `/v1` forwarding:** for a request with no valid `lo_sid`, the BFF forwards to Nest
  with **no** `X-Internal-Auth` header at all. Nest's optional-auth guard treats an absent
  assertion as anonymous (public reads work; required-auth routes 401). There is never a
  "sub-less" assertion.

### 4.3 OAuth request path + handoff (today it terminates in Nest)

Nest is private, so the provider callback cannot point at it. **Both** the OAuth *start*
(`GET /v1/auth/{provider}`) and the *callback* traverse the **public BFF → private Nest**, like
any other `/v1/*` route:

1. **Provider callback URL** registered with Google/GitHub is
   `${PUBLIC_OAUTH_CALLBACK_BASE_URL}/v1/auth/{provider}/callback` — the **public** origin, never
   the private Nest. Today the strategies build `callbackURL` from `apiBaseUrl`
   (`strategies/google.strategy.ts:19`, `github.strategy.ts:19`); that must become the public
   callback base, or the callback is unreachable once Nest goes private.
2. **Both legs go through the BFF.** Start and callback are `/v1/auth/*` paths the BFF rewrites
   to Nest; there is no direct browser→Nest or provider→Nest path.
3. **The BFF relays faithfully.** On start it relays Nest's 302 to the provider (carrying the
   `state`) and sets the `lo_oauth_state` cookie on the browser response. On callback it forwards
   the provider's `code`/`state` query **and** the `lo_oauth_state` cookie to Nest, then relays
   Nest's 302 (to `${WEB_URL}/auth/callback?code=…` or `?error=…`) back to the browser.
4. **Config split:** `PUBLIC_OAUTH_CALLBACK_BASE_URL` (browser/provider-facing = the WEB origin)
   is a **distinct** variable from `INTERNAL_API_BASE_URL` (private Nest). The strategy
   `callbackURL` and the state cookie's scope use the public one; internal BFF→Nest calls use the
   internal one.

**Handoff.** On OAuth success Nest does **not** set browser cookies and does **not** create a
session. It records a **pending single-use, ≤60 s handoff record** (server-side, holding the
authenticated `sub` + the validated `returnTo`), then 302s to `${WEB_URL}/auth/callback?code=…`.
The web callback **route handler** exchanges the code server-to-server using a **purpose-scoped
exchange assertion** (`aud: "auth-exchange"`, NOT a user assertion — it proves "the BFF is
calling", carrying no `sub`/`sid`). Nest validates + consumes the code and **returns
`{ sub, returnTo }`** — no session, no user tokens (§4.2). The `returnTo` was validated at OAuth
**start** (`isSafeReturnTo`) and bound to the code **server-side**, so the BFF trusts it rather
than reading a destination off the redirect URL (no open-redirect). **The BFF then creates the
authoritative session** — it generates `sid` + `lo_sid`, writes the store row, sets the cookie,
and redirects to `returnTo`. The web never fabricates `sub` or a destination, and the `sid` is
the BFF's, not Nest's.

### 4.4 Session concurrency (no token rotation)

Because there are **no Nest access/refresh tokens** (§4.2), the earlier "reconstruct the
successor of a hash-only rotation" problem **does not exist**. A request is authorized by a
freshly-minted ≤60 s assertion derived from the store row; there is nothing to rotate per
request, and no irreversible-hash gymnastics. Concurrency reduces to **session validity**: each
request checks the row is live (not revoked, not expired) and *slides* `lastUsedAt` with a
**monotonic** update — `SET lastUsedAt = GREATEST(lastUsedAt, <now>)` — so a slow/reordered
request carrying an older timestamp can never move it backwards. No locks or grace windows.

**Session lifetime — Decision: sliding idle + absolute cap.** The store tracks `createdAt` and
`lastUsedAt`; a session is live while `now < min(lastUsedAt + 30d, createdAt + 90d)`. An active
user is not logged out at a fixed 30-day wall, but no session outlives 90 days. (Chosen over a
fixed 30-day lifetime for UX; the absolute cap bounds risk.)

### 4.5 The rest of the epic

1. **Logout** is `lo_sid`-driven and idempotent, **tombstone-first**: the BFF sets `revokedAt`
   on the store row **before** clearing `lo_sid`. Since the BFF mints assertions only from a
   live row, **no new** assertion is issued after tombstoning. An **already-issued** ≤60 s
   assertion, however, stays valid until it expires — Nest verifies only signature/claims/
   freshness (§4.2), **not** a shared revocation list. So the honest guarantee is: *tombstoning
   prevents new assertions; already-issued ones finish within the ≤60 s TTL.* (Optional
   hardening, deferred: have Nest consult a shared revoked-`sid` set for immediate cutoff, at a
   per-request lookup cost.) The tombstoned row is purged after the TTL. There is no external
   Nest token to revoke (assertions self-expire), so deletion loses nothing. A repeat logout
   with a stale/absent `lo_sid` is still a 200. Origin/CSRF-checked.
2. **CSRF**: an Origin/Referer (or token) check runs before guards/business logic on unsafe
   cookie-authenticated methods; browser mutations require an approved content type.
3. **Cookie scope**: one host-only `lo_sid` cookie on the single public origin — an **opaque
   bearer session token** (whoever holds it is the session; it is a random opaque string, not a
   JWT with claims, and it is stored hashed server-side). There is **no user JWT/access/refresh
   token anywhere near the browser**; the session lives only as a BFF store row. Migrate off the
   legacy `lo_access`/`lo_refresh` `Domain` cookies to the new host-only `lo_sid`; bounded
   read+clear of the old names.
4. **Cache privacy**: viewer-dependent GETs and authenticated HTML default to
   `Cache-Control: private, no-store, max-age=0`; public caching is an explicit opt-in.
5. **Session states**: `getSession()` stops swallowing 5xx into "logged out"; the guard
   preserves *absent* credentials as optional but surfaces expired/invalid/infra distinctly.
6. **Cross-tab lifecycle**: one `sessionChanged(principal)` path (login/callback, logout,
   session-expiry, cross-tab `BroadcastChannel`) cancels viewer-owned work, clears
   private cache, and remounts/locks protected forms. Principal-scoped query keys (the
   `usePrincipal()` seam from FRONTEND-01) are the start.

**Explicit sequencing guard:** do **not** remove the cookie `Domain` before the one-origin
boundary exists — that would break current RSC authentication.

## 5. Consequences

- **Positive:** sessions last their full window with no fixed 15-min boundary; there are no
  per-request token rotations to race; logout always works and is tombstone-first; no user
  token ever reaches the browser or data endpoints; infra failures are observable; cross-tab
  account safety.
- **Cost:** a BFF/proxy boundary, a cookie-name migration with a bounded compatibility
  window, and CSRF + cache-header work. Larger than a patch — deliberately.
- **Interim (before the epic lands):** we will NOT ship the one-line `client.ts` patch as a
  "fix"; it would mask 1.1–1.6. TEST-01 / FRONTEND-01 / CONTRACT-01A (already done) are
  independent and unblocked; CONTRACT-01B remains open (`docs/contract-01-status.md`).

## 6. Acceptance criteria (the "red tests")

Each criterion below flips to active when delivered, expressed against the chosen model
(stable `lo_sid` + BFF session store, no browser tokens). **Encoding status is explicit** — most
are not yet executable; authoring them is part of the epic (today's e2e `signIn()` at
`apps/web/e2e/helpers.ts:79` only sets an access cookie and there is no session store yet). This
corrects an earlier over-claim that "all criteria are encoded."

| # | Criterion (new model) | Encoding status |
|---|---|---|
| AUTH-01 | A live `lo_sid` session authenticates a protected RSC render **and** client call well past the old 15-min access boundary (there is no fixed access-cookie expiry to fall off). | **Placeholder** `test.fixme` (`auth-settings.spec.ts`); NOT runnable until the e2e harness can establish a real BFF session-store row + `lo_sid` cookie. |
| AUTH-02 | Logout on `lo_sid` **tombstones** the store row and clears the cookie; a repeat after revocation is an idempotent 200. | **To author.** The existing `02-auth.cjs` `todo` covers only the interim Nest-side logout-guard drop (§1.2) — orthogonal to BFF `lo_sid` tombstoning, which needs the session store. |
| AUTH-05 | N concurrent requests on one `lo_sid` all succeed with **no** token rotation; `lastUsedAt` slides idempotently and the row is never corrupted. | **To author** — needs the BFF session store + handler. |
| AUTH-06 | A simulated BFF/Nest infrastructure failure is distinguishable from logged-out (not rendered anonymous). | **To author** — needs a fault-injection seam. |
| AUTH-07 | A hostile sibling-origin `POST` carrying a valid `lo_sid` is rejected by the Origin/CSRF check. | **To author** — needs the CSRF check to exist. |
| AUTH-03 / FRONTEND-24 | After account switch in one browser, a stale tab cannot submit under the new `lo_sid`, and its private cache is cleared. | **To author** — needs the cross-tab lifecycle + a two-session e2e helper. |

**First harness task of the epic:** add a **BFF session-store fixture** and an e2e helper that
establishes a real `lo_sid` session (store row + host-only cookie), replacing the access-only
`signIn()` — so AUTH-01/02/05/03 become executable (cf. Codex TEST-02).

## 7. References

- Root cause + related: `issues_spotted_by_codex.md` §4–5, `issues_combined_claude_vs_codex.md` §5.3.
- Code: `apps/api/src/modules/auth/{token.service,auth.controller}.ts`,
  `apps/web/src/lib/{api/client,session}.ts`, `apps/web/src/components/session-provider.tsx`.
