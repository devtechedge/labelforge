import dotenv from "dotenv";
import { defineConfig, devices } from "@playwright/test";

dotenv.config({ path: ".env.test" });

const baseURL = "http://localhost:3000";
const testDatabaseUrl = process.env.DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("DATABASE_URL is required for Playwright tests.");
}
if (!/localhost|127\.0\.0\.1|::1/.test(testDatabaseUrl) || !/_test(\?|$)/.test(testDatabaseUrl)) {
  throw new Error(
    "Playwright refuses to run unless DATABASE_URL is local and ends with _test.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  outputDir: "test-results",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      NEXT_PUBLIC_APP_URL: baseURL,
      DEMO_MODE: "true",
      DEMO_DEPLOYMENT: "false",
    },
  },
});
