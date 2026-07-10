import { defineConfig, devices } from "@playwright/test";

const apiPort = process.env.E2E_API_PORT ?? "4010";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3100";
const apiBaseUrl = `http://localhost:${apiPort}/v1`;
const webBaseUrl = `http://localhost:${webPort}`;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public";

const accessSecret = process.env.E2E_JWT_ACCESS_SECRET ?? "e2e-access-secret-0123456789abcdef";

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
      env: { NEXT_PUBLIC_API_BASE_URL: apiBaseUrl },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
