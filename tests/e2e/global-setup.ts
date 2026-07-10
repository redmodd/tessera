import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

const REPO_ROOT = process.cwd();
export const VARIANTS_ROOT = resolve(REPO_ROOT, 'tests/.e2e-variants');

export type Standard = 'web' | 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';
export type FixtureName =
  'free' | 'custom-quiz' | 'custom-layout' | 'broken-page';

interface FixtureSpec {
  source: string;
  standards: readonly Standard[];
}

const FIXTURES: Record<FixtureName, FixtureSpec> = {
  free: {
    source: resolve(REPO_ROOT, 'tests/fixtures/free'),
    standards: ['web', 'scorm12', 'scorm2004', 'cmi5', 'xapi'],
  },
  'custom-quiz': {
    source: resolve(REPO_ROOT, 'tests/fixtures/custom-quiz'),
    standards: ['scorm12', 'scorm2004', 'cmi5', 'xapi'],
  },
  'custom-layout': {
    source: resolve(REPO_ROOT, 'tests/fixtures/custom-layout'),
    standards: ['web'],
  },
  'broken-page': {
    source: resolve(REPO_ROOT, 'tests/fixtures/broken-page'),
    standards: ['web'],
  },
};

export function variantDir(fixture: FixtureName, standard: Standard): string {
  return resolve(VARIANTS_ROOT, fixture, standard);
}

// vite is only installed inside each fixture's node_modules in this pnpm
// workspace — it's not hoisted to the repo root. Use the fixture's binary
// directly rather than relying on PATH or root-level resolution.
export function viteBin(fixture: FixtureName): string {
  return resolve(FIXTURES[fixture].source, 'node_modules/.bin/vite');
}

// Run with `node` directly; pnpm skips the .bin/tessera shim when dist isn't built at install time (CI builds after).
export function tesseraCli(fixture: FixtureName): string {
  return resolve(
    FIXTURES[fixture].source,
    'node_modules/tessera-learn/dist/plugin/cli.js',
  );
}

export function fixtureSource(fixture: FixtureName): string {
  return FIXTURES[fixture].source;
}

/**
 * Run a command and surface stderr on failure. promisify(exec) attaches
 * stdout/stderr to the error object but the default error message is just
 * "Command failed: ..." — useless for debugging a parallel build that died.
 */
async function run(
  file: string,
  args: string[],
  opts: { cwd: string; timeout: number },
): Promise<void> {
  try {
    await execFileAsync(file, args, opts);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `${e.message}\n--- stdout ---\n${e.stdout ?? ''}\n--- stderr ---\n${e.stderr ?? ''}`,
    );
  }
}

async function buildVariant(
  fixtureName: FixtureName,
  standard: Standard,
): Promise<void> {
  const spec = FIXTURES[fixtureName];
  const dir = variantDir(fixtureName, standard);
  cpSync(spec.source, dir, {
    recursive: true,
    filter: (src) =>
      !src.includes(`${spec.source}/node_modules`) &&
      !src.includes(`${spec.source}/dist`) &&
      !src.endsWith('.zip'),
  });

  // Symlink the fixture's node_modules into the variant. Without this,
  // `import { tesseraPlugin } from 'tessera-learn/plugin'` in the variant's
  // vite.config.js cannot resolve — tessera-learn is a workspace symlink at
  // <fixture>/node_modules/tessera-learn and is not hoisted to the repo root.
  symlinkSync(
    resolve(spec.source, 'node_modules'),
    resolve(dir, 'node_modules'),
    'dir',
  );

  const configPath = resolve(dir, 'course.config.js');
  const original = readFileSync(configPath, 'utf-8');
  const pattern = /export:\s*\{\s*standard:\s*["'][^"']*["']\s*\}/;
  if (!pattern.test(original)) {
    throw new Error(
      `[e2e globalSetup] ${fixtureName}/course.config.js: failed to substitute export.standard for "${standard}". ` +
        `Did the file's formatting change? Expected to match /export:\\s*\\{\\s*standard:\\s*["'][^"']*["']\\s*\\}/.`,
    );
  }
  const patched = original.replace(
    pattern,
    `export: { standard: '${standard}' }`,
  );
  writeFileSync(configPath, patched);

  // `vite build [root]` — root is a positional arg in vite v8, not a --flag.
  await run(viteBin(fixtureName), ['build', dir], {
    cwd: dir,
    timeout: 60_000,
  });
}

export default async function globalSetup(): Promise<void> {
  for (const [name, spec] of Object.entries(FIXTURES) as [
    FixtureName,
    FixtureSpec,
  ][]) {
    const bin = viteBin(name);
    if (!existsSync(bin)) {
      throw new Error(
        `[e2e globalSetup] vite binary not found at ${bin}. Run \`pnpm install\` first.`,
      );
    }
    // Stale dist/ in source fixtures is harmless (no test reads it after the
    // refactor — assertions check variantDir(...)/dist instead) but cheap to wipe.
    rmSync(resolve(spec.source, 'dist'), { recursive: true, force: true });
  }
  // Wipe the entire variants tree so a previous run's orphans (e.g. from a
  // different fixture layout, or a fixture that was renamed/removed) don't
  // leak into this run. Cheaper than scanning for unexpected entries.
  rmSync(VARIANTS_ROOT, { recursive: true, force: true });
  mkdirSync(VARIANTS_ROOT, { recursive: true });

  const tasks = (Object.keys(FIXTURES) as FixtureName[]).flatMap((name) =>
    FIXTURES[name].standards.map((standard) => buildVariant(name, standard)),
  );
  await Promise.all(tasks);
}
