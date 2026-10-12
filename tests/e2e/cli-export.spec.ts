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
import { VARIANTS_ROOT, fixtureSource, tesseraCli } from './global-setup.js';

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

test.describe('Export: a source a plugin saves during the build', () => {
  const page = 'pages/03-assessment/02-graded-quiz/quiz.svelte';
  const save = `appendFileSync('${page}', '<p>Saved during the build</p>');`;
  let projectDir: string;

  test.afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  function exportSavingFrom(name: string, hook: string) {
    projectDir = resolve(VARIANTS_ROOT, name);
    copyFreeFixture(projectDir);
    writeFileSync(
      resolve(projectDir, 'tessera.config.js'),
      `import { appendFileSync } from 'node:fs';

export default { plugins: [{ name: 'save-during-build', ${hook} }] };
`,
    );
    return execFileAsync(
      process.execPath,
      [tesseraCli('free'), 'export', '--standard', 'cmi5'],
      { cwd: projectDir, timeout: 60_000 },
    );
  }

  test('fails the export and writes no package when the save follows validation', async () => {
    await expect(
      exportSavingFrom(
        'saved-mid-build',
        `transform(_code, id) { if (id.endsWith('${page}')) ${save} }`,
      ),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(
        `1 file(s) changed during the build, after validation: ${page}.`,
      ),
    });
    expect(existsSync(resolve(projectDir, 'dist'))).toBe(false);
    expect(readdirSync(projectDir).filter((f) => f.endsWith('.zip'))).toEqual(
      [],
    );
  });

  test('validates and packages a save made in buildStart', async () => {
    await exportSavingFrom('saved-in-build-start', `buildStart() { ${save} }`);

    expect(existsSync(resolve(projectDir, 'dist', 'index.html'))).toBe(true);
    expect(readdirSync(projectDir).some((f) => f.endsWith('.zip'))).toBe(true);
  });
});
