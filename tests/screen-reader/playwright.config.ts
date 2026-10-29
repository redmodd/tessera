import { withGuidepup } from '@guidepup/playwright';

const port = 5190;

// Playwright's Firefox doesn't start on current macOS.
const browsers =
  process.platform === 'darwin'
    ? (['webkit', 'chromium'] as const)
    : (['chromium', 'firefox'] as const);

// Runs NVDA on Windows and VoiceOver on macOS: see .github/workflows/screen-reader.yml.
export default withGuidepup({
  testDir: '.',
  outputDir: '../../test-results/screen-reader',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: browsers.map((browserName) => ({
    name: browserName,
    use: { browserName },
  })),
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${port} --strictPort`,
    cwd: '../fixtures/screen-reader',
    port,
    timeout: 60000,
  },
});
