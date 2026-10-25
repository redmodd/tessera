import { defineConfig } from '@playwright/test';

const PORTS = {
  free: 5180,
  sequential: 5181,
  'custom-layout': 5182,
  'custom-quiz': 5183,
} as const;

type CrossBrowser = 'firefox' | 'webkit';

// CI's cross-browser job sets E2E_BROWSER to run only the specs where browsers
// differ. Opt-in because Playwright's Firefox does not start on macOS 27.
const crossBrowser = process.env.E2E_BROWSER as CrossBrowser | undefined;

const crossBrowserProjects = (browserName: CrossBrowser) => [
  {
    name: browserName,
    use: { browserName, baseURL: `http://localhost:${PORTS.free}` },
    testMatch: /\/(navigation|components|quiz)\.spec\.ts$/,
  },
  // WebKit is the closest engine to iOS Safari.
  ...(browserName === 'webkit'
    ? [
        {
          name: 'mobile-webkit',
          use: {
            browserName,
            baseURL: `http://localhost:${PORTS.free}`,
            viewport: { width: 375, height: 667 },
            hasTouch: true,
          },
          testMatch: /mobile\.spec\.ts$/,
        },
      ]
    : []),
];

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: process.env.CI ? 'dot' : 'list',
  // Pre-builds every fixture variant in global-setup.ts's FIXTURES map into
  // tests/.e2e-variants/{fixture}/{standard} so specs read pre-built dist/
  // output instead of mutating the source fixtures and rebuilding mid-suite.
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    trace: 'retain-on-failure',
  },
  // Each test file gets its own BrowserContext, so localStorage and per-test
  // state are isolated. GitHub-hosted ubuntu runners have 4 cores; cap workers
  // there. Drop back if flakiness or OOMs appear.
  fullyParallel: true,
  workers: process.env.CI ? 4 : undefined,
  projects: crossBrowser
    ? crossBrowserProjects(crossBrowser)
    : [
        {
          name: 'free-mode',
          use: {
            browserName: 'chromium',
            baseURL: `http://localhost:${PORTS.free}`,
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
            /standalone-retry\.spec\.ts$/,
          ],
        },
        {
          name: 'custom-layout',
          use: {
            browserName: 'chromium',
            baseURL: `http://localhost:${PORTS['custom-layout']}`,
          },
          testMatch: /layout-override\.spec\.ts$/,
        },
        {
          name: 'custom-quiz',
          use: {
            browserName: 'chromium',
            baseURL: `http://localhost:${PORTS['custom-quiz']}`,
          },
          testMatch: /custom-quiz\.spec\.ts$/,
        },
        {
          name: 'sequential-mode',
          use: {
            browserName: 'chromium',
            baseURL: `http://localhost:${PORTS.sequential}`,
          },
          testMatch: /sequential\.spec\.ts$/,
        },
        {
          name: 'mobile',
          use: {
            browserName: 'chromium',
            baseURL: `http://localhost:${PORTS.free}`,
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
          testMatch: /(lms-variants|standalone-retry)\.spec\.ts$/,
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
  webServer: Object.entries(PORTS).map(([fixture, port]) => ({
    command: `cd tests/fixtures/${fixture} && pnpm dev --port ${port}`,
    port,
    env: { TESSERA_STANDARD: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 20000,
  })),
});
