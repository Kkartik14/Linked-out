import { defineConfig, devices } from "@playwright/test";

/**
 * Handoff-mode acceptance config (ADR 0001 §6). The legacy `playwright.config.ts` proves the app
 * works when the browser talks to Nest directly with `lo_access`; this one proves the one-origin
 * BFF path: the browser holds only `lo_sid`, `proxy.ts` + the `/v1` route handler resolve it, and a
 * protected render survives with no 15-minute access boundary to fall off (AUTH-01).
 *
 * The web must be BUILT with a relative `NEXT_PUBLIC_API_BASE_URL=/v1` (so the browser calls its own
 * origin) — the `test:e2e:handoff` script does that build. The web SERVER then runs with
 * `OAUTH_SESSION_MODE=handoff` so the proxy, route handlers, and RSC self-hop go live.
 */

const apiPort = process.env.E2E_API_PORT ?? "4010";
const webPort = process.env.PLAYWRIGHT_WEB_PORT ?? "3100";
const apiBaseUrl = `http://localhost:${apiPort}/v1`;
const webBaseUrl = `http://localhost:${webPort}`;

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://linkedout:linkedout@localhost:5432/linkedout_test?schema=public";

const accessSecret = process.env.E2E_JWT_ACCESS_SECRET ?? "e2e-access-secret-0123456789abcdef";
const bffCallerSecret =
  process.env.E2E_BFF_CALLER_SECRET ?? "e2e-bff-caller-secret-0123456789abcdef";
const internalApiSecret =
  process.env.E2E_INTERNAL_API_SECRET ?? "e2e-internal-api-secret-0123456789abcdef";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "auth-handoff.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: { baseURL: webBaseUrl, trace: "on-first-retry" },
  webServer: [
    {
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
      // The one-origin web tier, running in handoff: proxy + /v1 route handlers live, and RSC
      // self-hops through /v1 to reach Nest. Requires a build with a relative NEXT_PUBLIC base URL.
      command: `pnpm exec next start -p ${webPort}`,
      url: webBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        OAUTH_SESSION_MODE: "handoff",
        INTERNAL_API_BASE_URL: `http://localhost:${apiPort}`,
        BFF_CALLER_SECRET: bffCallerSecret,
        NEXT_PUBLIC_API_BASE_URL: "/v1",
      },
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
