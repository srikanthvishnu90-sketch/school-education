import { defineConfig, devices } from "@playwright/test";

/**
 * e2e config for the student cycle. Runs single-worker against a dev server on a
 * dedicated port, under prefers-reduced-motion (the surface must work with motion
 * off). No parallelism: the in-memory seeded world is one process-lifetime store.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    reducedMotion: "reduce",
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
