import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  cpSync,
  existsSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import {
  VARIANTS_ROOT,
  fixtureSource,
  tesseraCli,
  viteBin,
} from './global-setup.js';

const execFileAsync = promisify(execFile);

// Inside the repo so workspace dep resolution matches a real course (a /tmp dir can't resolve svelte).
function copyFreeFixture(projectDir: string): void {
  const source = fixtureSource('free');
  rmSync(projectDir, { recursive: true, force: true });
  cpSync(source, projectDir, {
    recursive: true,
    filter: (src) =>
      !src.includes(`${source}/node_modules`) &&
      !src.includes(`${source}/dist`) &&
      !src.endsWith('.zip'),
  });
  symlinkSync(
    resolve(source, 'node_modules'),
    resolve(projectDir, 'node_modules'),
    'dir',
  );
}

// Covers the `tessera export` path; the fixtures' raw `vite build` never does.
test.describe('CLI — tessera export', () => {
  const projectDir = resolve(VARIANTS_ROOT, 'cli-smoke');

  test.beforeAll(() => copyFreeFixture(projectDir));

  test.afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test('builds dist/ via the CLI', async () => {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [tesseraCli('free'), 'export'],
      { cwd: projectDir, timeout: 60_000 },
    );

    expect(stdout + stderr).toContain('Web export');
    expect(existsSync(resolve(projectDir, 'dist', 'index.html'))).toBe(true);
  });
});

test.describe('Export: a source saved during the build', () => {
  const projectDir = resolve(VARIANTS_ROOT, 'saved-mid-build');
  const page = 'pages/03-assessment/02-graded-quiz/quiz.svelte';

  // The CLI takes no plugins, so the save comes from one in a vite.config.js.
  test.beforeAll(() => {
    copyFreeFixture(projectDir);
    writeFileSync(
      resolve(projectDir, 'vite.config.js'),
      `import { appendFileSync } from 'node:fs';
import { tesseraPlugin } from 'tessera-learn/plugin';

export default {
  plugins: [
    tesseraPlugin({ standardOverride: 'cmi5' }),
    {
      name: 'save-after-validation',
      buildStart() {
        appendFileSync('${page}', '<p>Saved during the build</p>');
      },
    },
  ],
};
`,
    );
  });

  test.afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test('fails the build and writes no package', async () => {
    const build = execFileAsync(viteBin('free'), ['build', projectDir], {
      cwd: projectDir,
      timeout: 60_000,
    });

    await expect(build).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `1 file(s) changed during the build, after validation: ${page}.`,
      ),
    });
    expect(existsSync(resolve(projectDir, 'dist'))).toBe(false);
    expect(readdirSync(projectDir).filter((f) => f.endsWith('.zip'))).toEqual(
      [],
    );
  });
});
