import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'dot' : 'list',
  // Pre-builds the five export-standard variants of tests/fixtures/free into
  // tests/.e2e-variants/{web,scorm12,scorm2004,cmi5,xapi} so the export and lms
  // projects can read pre-built dist/ output instead of mutating the source
  // fixture and rebuilding mid-suite.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    trace: 'on-first-retry',
  },
  // Each test file gets its own BrowserContext, so localStorage and per-test
  // state are isolated. GitHub-hosted ubuntu runners have 4 cores; cap workers
  // there. Drop back if flakiness or OOMs appear.
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
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
        /custom-quiz\.spec\.ts$/,
        /a11y-audit\.spec\.ts$/,
        /lms-variants\.spec\.ts$/,
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
      name: 'custom-quiz',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:5183',
      },
      testMatch: /custom-quiz\.spec\.ts$/,
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
    },
    {
      name: 'lms',
      use: { browserName: 'chromium' },
      testMatch: /lms-roundtrip\.spec\.ts$/,
    },
    {
      name: 'lms-variants',
      use: { browserName: 'chromium' },
      testMatch: /lms-variants\.spec\.ts$/,
    },
    {
      name: 'a11y-audit',
      use: { browserName: 'chromium' },
      testMatch: /a11y-audit\.spec\.ts$/,
    },
  ],
  // The fixtures read TESSERA_STANDARD for the variant pre-build; the servers
  // Playwright starts blank it so an exported value in a developer's shell can't
  // turn a dev server into an LMS build. A server reused via reuseExistingServer
  // keeps whatever environment it was started with.
  webServer: [
    {
      command: 'cd tests/fixtures/free && pnpm dev --port 5180',
      port: 5180,
      env: { TESSERA_STANDARD: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'cd tests/fixtures/sequential && pnpm dev --port 5181',
      port: 5181,
      env: { TESSERA_STANDARD: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'cd tests/fixtures/custom-layout && pnpm dev --port 5182',
      port: 5182,
      env: { TESSERA_STANDARD: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
    {
      command: 'cd tests/fixtures/custom-quiz && pnpm dev --port 5183',
      port: 5183,
      env: { TESSERA_STANDARD: '' },
      reuseExistingServer: !process.env.CI,
      timeout: 20000,
    },
  ],
});
