import { withGuidepup } from '@guidepup/playwright';

const port = 5190;

// Runs NVDA on Windows and VoiceOver on macOS: see .github/workflows/screen-reader.yml.
export default withGuidepup({
  testDir: '.',
  outputDir: '../../test-results/screen-reader',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox', use: { browserName: 'firefox' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${port} --strictPort`,
    cwd: '../fixtures/screen-reader',
    port,
    timeout: 60000,
  },
});
