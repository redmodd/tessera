import { withGuidepup } from '@guidepup/playwright';

const port = 5190;

// WebKit stands in for Safari, which is macOS-only. VoiceOver in Firefox
// misreads text fields and sometimes ignores clicks; NVDA covers Firefox.
const browsers =
  process.platform === 'darwin'
    ? (['chromium', 'webkit'] as const)
    : (['chromium', 'firefox'] as const);

// Runs NVDA on Windows and VoiceOver on macOS: see .github/workflows/screen-reader.yml.
export default withGuidepup({
  testDir: '.',
  outputDir: '../../test-results/screen-reader',
  timeout: 90000,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['json', { outputFile: '../../test-results/screen-reader/report.json' }]],
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
