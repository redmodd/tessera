import { test, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { VARIANTS_ROOT, fixtureSource, tesseraCli } from './global-setup.js';

const execFileAsync = promisify(execFile);

// One shared workspace built in beforeAll, mutated by the per-standard tests.
// Serial keeps the file on a single worker so beforeAll runs once and the tests
// don't race on wsRoot.
test.describe.configure({ mode: 'serial' });

// A marker baked into the shared component. If $shared fails to resolve, the
// build errors (non-zero exit); if it resolves, this string lands in the bundle.
const SHARED_MARKER = 'SHARED_COMPONENT_MARKER';

const STANDARDS = ['web', 'scorm12', 'scorm2004', 'cmi5'] as const;

// Build the workspace tree under VARIANTS_ROOT (inside the repo so the symlinked
// node_modules resolves svelte/tessera-learn the way a real course would).
const wsRoot = resolve(VARIANTS_ROOT, 'workspace-smoke');

function writeFileEnsuring(path: string, content: string): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function writeCourse(name: string, title: string, standard: string): void {
  const root = join(wsRoot, 'courses', name);
  writeFileEnsuring(
    join(root, 'course.config.js'),
    `export default {
  title: '${title}',
  language: 'en',
  navigation: { mode: 'free' },
  completion: { mode: 'percentage', percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: '${standard}' },
};`,
  );
  writeFileEnsuring(
    join(root, 'pages', '01-section', '_meta.js'),
    "export default { title: 'Section' };",
  );
  writeFileEnsuring(
    join(root, 'pages', '01-section', '01-lesson', '_meta.js'),
    "export default { title: 'Lesson' };",
  );
  writeFileEnsuring(
    join(root, 'pages', '01-section', '01-lesson', 'page.svelte'),
    `<script>
  import Button from '$shared/Button.svelte';
</script>

<h1>${title}</h1>
<Button>Continue</Button>`,
  );
}

function rewriteStandard(name: string, standard: string): void {
  const cfg = join(wsRoot, 'courses', name, 'course.config.js');
  writeFileSync(
    cfg,
    readFileSync(cfg, 'utf-8').replace(
      /export:\s*\{\s*standard:\s*['"][^'"]*['"]\s*\}/,
      `export: { standard: '${standard}' }`,
    ),
  );
}

async function runExport(course: string): Promise<string> {
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [tesseraCli('free'), 'export', course],
    { cwd: wsRoot, timeout: 60_000 },
  );
  return stdout + stderr;
}

function bundleContains(courseRoot: string, needle: string): boolean {
  const dist = join(courseRoot, 'dist');
  const walk = (dir: string): boolean =>
    readdirSync(dir, { withFileTypes: true }).some((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return (
        /\.(js|html)$/.test(e.name) && readFileSync(p, 'utf-8').includes(needle)
      );
    });
  return existsSync(dist) && walk(dist);
}

test.beforeAll(() => {
  const source = fixtureSource('free');
  rmSync(wsRoot, { recursive: true, force: true });
  mkdirSync(join(wsRoot, 'courses'), { recursive: true });

  // One node_modules at the workspace root — the shape a real workspace has.
  symlinkSync(
    resolve(source, 'node_modules'),
    resolve(wsRoot, 'node_modules'),
    'dir',
  );

  // Shared design system imported by every course via $shared.
  writeFileEnsuring(
    join(wsRoot, 'shared', 'Button.svelte'),
    `<script>
  let { children } = $props();
</script>

<button class="shared-btn">${SHARED_MARKER} {@render children?.()}</button>`,
  );

  writeCourse('alpha', 'Alpha Course', 'web');
  writeCourse('beta', 'Beta Course', 'scorm12');
});

test.afterAll(() => {
  rmSync(wsRoot, { recursive: true, force: true });
});

test.describe('Workspace — many courses, shared design system', () => {
  test('each named course exports independently with $shared bundled', async () => {
    await runExport('alpha');
    await runExport('beta');

    const alpha = join(wsRoot, 'courses', 'alpha');
    const beta = join(wsRoot, 'courses', 'beta');

    // Each course owns its own build output.
    expect(existsSync(join(alpha, 'dist', 'index.html'))).toBe(true);
    expect(existsSync(join(beta, 'dist', 'index.html'))).toBe(true);

    // $shared resolved and bundled into each course's output.
    expect(bundleContains(alpha, SHARED_MARKER)).toBe(true);
    expect(bundleContains(beta, SHARED_MARKER)).toBe(true);

    // beta (scorm12) produced its own LMS package; alpha (web) did not.
    const betaZip = readdirSync(beta).some((f) => f.endsWith('.zip'));
    const alphaZip = readdirSync(alpha).some((f) => f.endsWith('.zip'));
    expect(betaZip).toBe(true);
    expect(alphaZip).toBe(false);
  });

  test('validate stays clean on a $shared-importing course', async () => {
    // Validate is import-agnostic; resolving (exit 0) proves a $shared import stays clean.
    await expect(
      execFileAsync(
        process.execPath,
        [tesseraCli('free'), 'validate', 'alpha'],
        { cwd: wsRoot, timeout: 30_000 },
      ),
    ).resolves.toBeDefined();
  });

  for (const standard of STANDARDS) {
    test(`exports a $shared-importing course to ${standard}`, async () => {
      rewriteStandard('alpha', standard);
      const out = await runExport('alpha');

      const alpha = join(wsRoot, 'courses', 'alpha');
      expect(existsSync(join(alpha, 'dist', 'index.html'))).toBe(true);
      expect(bundleContains(alpha, SHARED_MARKER)).toBe(true);
      if (standard !== 'web') {
        expect(out.toLowerCase()).toContain('export');
        expect(readdirSync(alpha).some((f) => f.endsWith('.zip'))).toBe(true);
      }
    });
  }
});
