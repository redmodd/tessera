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
import { pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);

const REPO_ROOT = process.cwd();
export const VARIANTS_ROOT = resolve(REPO_ROOT, 'tests/.e2e-variants');

export type Standard = 'web' | 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';
export type FixtureName =
  | 'free'
  | 'custom-quiz'
  | 'custom-layout'
  | 'broken-page'
  | 'quiz-timing'
  | 'completion-quiz';

interface FixtureSpec {
  source: string;
  standards: readonly Standard[];
  // Course-level settings for this variant. Keys are replaced whole, so
  // `completion` arrives without the fields of the mode it replaces.
  overrides?: Record<string, unknown>;
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
  // Its own fixture, not extra pages in `free`: cmi.core.score.raw is the
  // course score, so adding graded quizzes to `free` would change what every
  // existing roundtrip assertion there sees.
  'completion-quiz': {
    source: resolve(REPO_ROOT, 'tests/fixtures/free'),
    standards: ['scorm2004'],
    overrides: { completion: { mode: 'quiz' } },
  },
  'quiz-timing': {
    source: resolve(REPO_ROOT, 'tests/fixtures/quiz-timing'),
    standards: ['scorm12'],
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
  opts: { cwd: string; timeout: number; env?: NodeJS.ProcessEnv },
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

// Paths JSON.stringify would drop or rewrite: functions, undefined, symbols,
// non-finite numbers, and anything that isn't a plain object or array.
function lossyPaths(value: unknown, path = ''): string[] {
  const type = typeof value;
  if (value === null || type === 'string' || type === 'boolean') return [];
  if (type === 'number')
    return Number.isFinite(value) ? [] : [path || '(root)'];
  if (Array.isArray(value))
    return value.flatMap((item, i) => lossyPaths(item, `${path}[${i}]`));
  if (type === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null)
      return Object.entries(value as object).flatMap(([key, item]) =>
        lossyPaths(item, path ? `${path}.${key}` : key),
      );
  }
  return [path || '(root)'];
}

// Importing and re-serializing rather than patching the source text: a regex has
// to guess where a setting's braces end, and patches the wrong span once that
// setting gains a nested object.
async function applyOverrides(
  dir: string,
  overrides: Record<string, unknown>,
): Promise<void> {
  const configPath = resolve(dir, 'course.config.js');
  const base = (await import(pathToFileURL(configPath).href)).default;
  const merged = { ...base, ...overrides };
  const lossy = lossyPaths(merged);
  if (lossy.length > 0) {
    throw new Error(
      `${configPath} holds values JSON cannot carry (${lossy.join(', ')}); ` +
        `an overridden variant would silently ship something else.`,
    );
  }
  writeFileSync(
    configPath,
    `export default ${JSON.stringify(merged, null, 2)};\n`,
  );
}

// What each standard leaves in dist/: the proof that TESSERA_STANDARD actually
// reached the plugin, since a fixture that ignores it still builds successfully.
const BUILD_MARKERS: Record<Standard, { file: string; contains?: string }[]> = {
  web: [],
  scorm12: [{ file: 'imsmanifest.xml', contains: '<schemaversion>1.2' }],
  scorm2004: [{ file: 'imsmanifest.xml', contains: '<schemaversion>2004' }],
  cmi5: [{ file: 'cmi5.xml' }],
  xapi: [{ file: 'tincan.xml' }],
};

const ALL_MARKER_FILES = ['imsmanifest.xml', 'cmi5.xml', 'tincan.xml'];

function assertBuiltStandard(
  fixtureName: FixtureName,
  standard: Standard,
  distDir: string,
): void {
  const wrong = (detail: string): Error =>
    new Error(
      `[e2e globalSetup] ${fixtureName} built for "${standard}" but ${detail}. ` +
        `Check that ${fixtureName}/vite.config.js passes the standard through: ` +
        `tesseraPlugin({ standardOverride: process.env.TESSERA_STANDARD }).`,
    );

  const expected = BUILD_MARKERS[standard];
  for (const { file, contains } of expected) {
    const path = resolve(distDir, file);
    if (!existsSync(path)) throw wrong(`dist/${file} is missing`);
    if (contains && !readFileSync(path, 'utf-8').includes(contains))
      throw wrong(`dist/${file} does not contain "${contains}"`);
  }

  const expectedFiles = expected.map((m) => m.file);
  for (const file of ALL_MARKER_FILES) {
    if (!expectedFiles.includes(file) && existsSync(resolve(distDir, file)))
      throw wrong(`dist/ also holds ${file}`);
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

  if (spec.overrides) {
    await applyOverrides(dir, spec.overrides);
  }

  // `vite build [root]` — root is a positional arg in vite v8, not a --flag.
  await run(viteBin(fixtureName), ['build', dir], {
    cwd: dir,
    timeout: 60_000,
    env: { ...process.env, TESSERA_STANDARD: standard },
  });

  assertBuiltStandard(fixtureName, standard, resolve(dir, 'dist'));
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
