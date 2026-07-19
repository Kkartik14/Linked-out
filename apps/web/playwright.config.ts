import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.E2E_API_PORT ?? "4010";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3100";
const apiBaseUrl = `http://localhost:${apiPort}/v1`;
const webBaseUrl = `http://localhost:${webPort}`;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public";

const accessSecret = process.env.E2E_JWT_ACCESS_SECRET ?? "e2e-access-secret-0123456789abcdef";

// BFF/session-authority secrets. Optional in legacy mode, so setting them here activates the
// internal `/v1/auth/sessions/{resolve,revoke}` + handoff-exchange endpoints without flipping
// OAUTH_SESSION_MODE — the legacy suite is unaffected. `bffCallerSecret` MUST match
// backend.cjs's default so a caller assertion a spec signs is one the API accepts. Both are
// ≥32 bytes (the API's minimum for a set internal secret).
const bffCallerSecret =
  process.env.E2E_BFF_CALLER_SECRET ?? "e2e-bff-caller-secret-0123456789abcdef";
const internalApiSecret =
  process.env.E2E_INTERNAL_API_SECRET ?? "e2e-internal-api-secret-0123456789abcdef";

/**
 * The e2e suite drives the real Next.js app against the real NestJS API and a real
 * Postgres — no mock backend. A pass therefore proves the browser, the fetch layer,
 * cookie auth, and the API contract all agree.
 *
 * Prerequisites (from the repo root):
 *   pnpm db:up
 *   pnpm db:test:setup                    # creates linkedout_test + migrations
 *   pnpm build                            # builds contracts, db, api
 *   cd apps/web && pnpm exec playwright install chromium
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Retry in CI: the first navigation to a route can click a submit button before the
  // client form has hydrated (react-hook-form validation then never fires). A retry
  // runs against a now-warm server with the route's JS cached, so it hydrates in time.
  // `trace: "on-first-retry"` captures a trace when that happens.
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
  },
  webServer: [
    {
      // cwd is the built output dir: it has no `.env`, so @nestjs/config cannot shadow
      // the test env below, and node resolves deps up into apps/api/node_modules.
      command: "node main.js",
      cwd: "../../apps/api/dist",
      url: `${apiBaseUrl}/meta/enums`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: apiPort,
        API_BASE_URL: `http://localhost:${apiPort}`,
        WEB_URL: webBaseUrl,
        TRUST_PROXY_HOPS: "0",
        DATABASE_URL: testDatabaseUrl,
        DIRECT_URL: testDatabaseUrl,
        JWT_ACCESS_SECRET: accessSecret,
        JWT_REFRESH_SECRET: "e2e-refresh-secret-0123456789abcdef",
        BFF_CALLER_SECRET: bffCallerSecret,
        INTERNAL_API_SECRET: internalApiSecret,
        COOKIE_DOMAIN: "",
        GOOGLE_CLIENT_ID: "e2e-google-client-id",
        GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
        GITHUB_CLIENT_ID: "e2e-github-client-id",
        GITHUB_CLIENT_SECRET: "e2e-github-client-secret",
        R2_ACCOUNT_ID: "",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_BUCKET: "e2e-avatars",
        R2_PUBLIC_BASE_URL: "",
        R2_ENDPOINT: "",
      },
    },
    {
      command: `pnpm exec next start -p ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      // NEXT_PUBLIC_* is inlined at build time, so the `test:e2e` script is what actually
      // decides this. Repeated here so a hand-run `playwright test` against an
      // already-built app agrees with the build rather than silently differing.
      env: { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
