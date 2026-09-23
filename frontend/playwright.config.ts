import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running stack (see the repository README).
 *
 * `channel: "msedge"` uses a browser already installed on the machine, so the
 * suite runs without a ~200 MB Playwright browser download. Swap it for a plain
 * chromium project after `npx playwright install` if you prefer.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // the tests share one seeded database
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "edge",
      use: { ...devices["Desktop Chrome"], channel: "msedge" },
    },
  ],
});
