import { exec } from 'node:child_process';
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

const execAsync = promisify(exec);

const REPO_ROOT = process.cwd();
const FIXTURE = resolve(REPO_ROOT, 'tests/fixtures/free');
const VARIANTS_ROOT = resolve(REPO_ROOT, 'tests/.e2e-variants');
// vite is only installed inside the fixture's node_modules in this pnpm
// workspace — it's not hoisted to the repo root. Use the fixture's binary
// directly rather than relying on PATH or root-level resolution.
export const VITE_BIN = resolve(FIXTURE, 'node_modules/.bin/vite');
const STANDARDS = ['web', 'scorm12', 'scorm2004', 'cmi5'] as const;

export type Standard = (typeof STANDARDS)[number];

export function variantDir(standard: Standard): string {
  return resolve(VARIANTS_ROOT, standard);
}

/**
 * Run a command and surface stderr on failure. promisify(exec) attaches
 * stdout/stderr to the error object but the default error message is just
 * "Command failed: ..." — useless for debugging a parallel build that died.
 */
async function run(cmd: string, opts: { cwd: string; timeout: number }): Promise<void> {
  try {
    await execAsync(cmd, opts);
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(
      `${e.message}\n--- stdout ---\n${e.stdout ?? ''}\n--- stderr ---\n${e.stderr ?? ''}`,
    );
  }
}

async function buildVariant(standard: Standard): Promise<void> {
  const dir = variantDir(standard);
  rmSync(dir, { recursive: true, force: true });
  cpSync(FIXTURE, dir, {
    recursive: true,
    filter: (src) =>
      !src.includes(`${FIXTURE}/node_modules`) &&
      !src.includes(`${FIXTURE}/dist`) &&
      !src.endsWith('.zip'),
  });

  // Symlink the fixture's node_modules into the variant. Without this,
  // `import { tesseraPlugin } from 'tessera-learn/plugin'` in the variant's
  // vite.config.js cannot resolve — tessera-learn is a workspace symlink at
  // <fixture>/node_modules/tessera-learn and is not hoisted to the repo root.
  symlinkSync(resolve(FIXTURE, 'node_modules'), resolve(dir, 'node_modules'), 'dir');

  const configPath = resolve(dir, 'course.config.js');
  const original = readFileSync(configPath, 'utf-8');
  const pattern = /export:\s*\{\s*standard:\s*"[^"]*"\s*\}/;
  if (!pattern.test(original)) {
    throw new Error(
      `[e2e globalSetup] course.config.js: failed to substitute export.standard for "${standard}". ` +
        `Did the file's formatting change? Expected to match /export:\\s*\\{\\s*standard:\\s*"[^"]*"\\s*\\}/.`,
    );
  }
  const patched = original.replace(pattern, `export: { standard: "${standard}" }`);
  writeFileSync(configPath, patched);

  // `vite build [root]` — root is a positional arg in vite v8, not a --flag.
  await run(`${VITE_BIN} build ${dir}`, {
    cwd: dir,
    timeout: 60_000,
  });
}

export default async function globalSetup(): Promise<void> {
  if (!existsSync(VITE_BIN)) {
    throw new Error(
      `[e2e globalSetup] vite binary not found at ${VITE_BIN}. Run \`pnpm install\` first.`,
    );
  }
  // Stale dist/ in the source fixture is harmless (no test reads it after the
  // refactor — assertions check variantDir(...)/dist instead) but cheap to wipe.
  rmSync(resolve(FIXTURE, 'dist'), { recursive: true, force: true });
  mkdirSync(VARIANTS_ROOT, { recursive: true });
  await Promise.all(STANDARDS.map(buildVariant));
}
