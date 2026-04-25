import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  use: {
    trace: 'on-first-retry',
  },
  // Files in non-LMS/export projects each get their own BrowserContext, so
  // localStorage and per-test state are already isolated. The LMS and export
  // projects are exceptions: they rewrite test-project-e2e/course.config.js
  // and run `pnpm build`, which the shared dev server picks up via HMR — so
  // they must stay single-threaded and run AFTER the parallel projects (a
  // rebuild mid-run will rip the rug out from under whoever's mid-test).
  // Workers cap at 2 so the projects don't fight over CPU on small CI runners.
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  projects: [
    {
      name: 'free-mode',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5180',
      },
      testIgnore: [
        /sequential\.spec\.ts$/,
        /mobile\.spec\.ts$/,
        /lms-roundtrip\.spec\.ts$/,
        /export\.spec\.ts$/,
        /layout-override\.spec\.ts$/,
      ],
    },
    {
      name: 'custom-layout',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5182',
      },
      testMatch: /layout-override\.spec\.ts$/,
    },
    {
      name: 'sequential-mode',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5181',
      },
      testMatch: /sequential\.spec\.ts$/,
    },
    {
      name: 'mobile',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5180',
        viewport: { width: 375, height: 667 },
        hasTouch: true,
      },
      testMatch: /mobile\.spec\.ts$/,
    },
    {
      name: 'export',
      use: { browserName: 'chromium' },
      testMatch: /export\.spec\.ts$/,
      // Export tests rebuild test-project-e2e and rewrite course.config.js,
      // so they must be strictly serial — and depend on the parallel projects
      // finishing first so the dev server's HMR doesn't churn under them.
      fullyParallel: false,
      dependencies: ['free-mode', 'sequential-mode', 'mobile'],
    },
    {
      name: 'lms',
      use: { browserName: 'chromium' },
      testMatch: /lms-roundtrip\.spec\.ts$/,
      // Same shared-state constraint as `export` — strict serial, runs last.
      // Depends on `export` so the two don't trample each other's
      // course.config.js rewrites (both also call `pnpm build` against the
      // same test-project-e2e, which would corrupt the dist/ artifacts).
      fullyParallel: false,
      dependencies: ['free-mode', 'sequential-mode', 'mobile', 'export'],
    },
  ],
  webServer: [
    {
      command: 'cd test-project-e2e && pnpm dev --port 5180',
      port: 5180,
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'cd test-project-e2e-sequential && pnpm dev --port 5181',
      port: 5181,
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'cd test-projects/custom-layout && pnpm dev --port 5182',
      port: 5182,
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
  ],
});
