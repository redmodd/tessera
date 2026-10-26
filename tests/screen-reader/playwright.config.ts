import { withGuidepup } from '@guidepup/playwright';

const port = 5190;

// NVDA runs only on Windows: see .github/workflows/screen-reader.yml.
export default withGuidepup({
  testDir: '.',
  outputDir: '../../test-results/screen-reader',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  failOnFlakyTests: !!process.env.CI,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${port} --strictPort`,
    cwd: '../fixtures/screen-reader',
    port,
    timeout: 60000,
  },
});
