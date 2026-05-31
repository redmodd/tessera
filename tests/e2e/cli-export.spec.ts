import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { cpSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { VARIANTS_ROOT, fixtureSource, tesseraCli } from './global-setup.js';

const execFileAsync = promisify(execFile);

// Covers the `tessera export` path; the fixtures' raw `vite build` never does.
test.describe('CLI — tessera export', () => {
  // Inside the repo so workspace dep resolution matches a real course (a /tmp dir can't resolve svelte).
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
