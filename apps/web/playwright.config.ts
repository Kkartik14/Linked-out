import { defineConfig, devices } from "@playwright/test";

/**
 * Prerequisites:
 *   pnpm build            # produce .next
 *   pnpm exec playwright install chromium
 *   pnpm test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    command: "pnpm exec next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
