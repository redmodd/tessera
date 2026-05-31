import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { VARIANTS_ROOT, fixtureSource, tesseraBin } from './global-setup.js';

const execFileAsync = promisify(execFile);

// The `tessera export` path scaffolded courses use, which the fixtures' raw
// `vite build` scripts never exercise.
test.describe('CLI — tessera export', () => {
  // Under VARIANTS_ROOT (gitignored, inside the repo) so workspace dep
  // resolution matches a scaffolded course; a /tmp dir can't resolve svelte.
  const projectDir = resolve(VARIANTS_ROOT, 'cli-smoke');

  test.beforeAll(() => {
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
  });

  test.afterAll(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  test('builds dist/ via the project-local bin', async () => {
    const { stdout, stderr } = await execFileAsync(
      tesseraBin('free'),
      ['export'],
      { cwd: projectDir, timeout: 60_000 },
    );

    expect(stdout + stderr).toContain('Web export');
    expect(existsSync(resolve(projectDir, 'dist', 'index.html'))).toBe(true);
  });
});
