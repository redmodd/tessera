import { devices } from '@playwright/test';
import { withGuidepup } from '@guidepup/playwright';

const port = 5190;

// NVDA runs only on Windows: see .github/workflows/screen-reader.yml.
export default withGuidepup({
  testDir: '.',
  outputDir: '../../test-results/screen-reader',
  timeout: 5 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [{ name: 'nvda', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${port} --strictPort`,
    cwd: '../fixtures/screen-reader',
    port,
    env: { TESSERA_STANDARD: '' },
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
