import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

let testDir: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(tmpdir(), `tessera-upgrade-test-${Date.now()}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const PKG_ROOT = resolve(__dirname, '..');
const CLI_PATH = resolve(PKG_ROOT, 'dist', 'index.js');

const TESSERA_VERSION: string =
  '^' +
  JSON.parse(readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf-8')).version;

function runCLI(
  args: string,
  cwd: string
): { stdout: string; stderr: string; output: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
    });
    return { stdout, stderr: '', output: stdout, exitCode: 0 };
  } catch (err: any) {
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    return { stdout, stderr, output: stdout + stderr, exitCode: err.status ?? 1 };
  }
}

interface SeedOptions {
  scripts?: Record<string, string>;
  tesseraVersion?: string | null;
  agentsMd?: string;
  viteConfig?: string;
}

function seedProject(dir: string, opts: SeedOptions = {}) {
  const pkg: any = {
    name: 'seeded-course',
    private: true,
    type: 'module',
    scripts: opts.scripts ?? {},
    dependencies: {},
  };
  if (opts.tesseraVersion !== null) {
    pkg.dependencies['tessera-learn'] = opts.tesseraVersion ?? '^0.0.1';
  }
  writeFileSync(
    resolve(dir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  );
  if (opts.agentsMd !== undefined) {
    writeFileSync(resolve(dir, 'AGENTS.md'), opts.agentsMd);
  }
  if (opts.viteConfig !== undefined) {
    writeFileSync(resolve(dir, 'vite.config.js'), opts.viteConfig);
  }
}

function readPkg(dir: string): any {
  return JSON.parse(readFileSync(resolve(dir, 'package.json'), 'utf-8'));
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// Build CLI before tests run.
execSync('pnpm build', { cwd: PKG_ROOT, stdio: 'ignore' });

describe('create-tessera upgrade', () => {
  it('adds a missing framework script', () => {
    seedProject(testDir, { scripts: { dev: 'vite dev', export: 'vite build' } });
    const { exitCode, stdout } = runCLI('upgrade', testDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('added "validate" script');
    expect(readPkg(testDir).scripts.validate).toBe('tessera-validate');
  });

  it('renames a stale framework script when its value is unchanged', () => {
    seedProject(testDir, { scripts: { preview: 'vite dev' } });
    const { exitCode } = runCLI('upgrade', testDir);
    expect(exitCode).toBe(0);
    const pkg = readPkg(testDir);
    expect(pkg.scripts.preview).toBeUndefined();
    expect(pkg.scripts.dev).toBe('vite dev');
  });

  it('keeps a repurposed stale script and still adds the replacement', () => {
    seedProject(testDir, { scripts: { preview: 'vite preview --port 5000' } });
    const { stdout } = runCLI('upgrade', testDir);
    const pkg = readPkg(testDir);
    expect(pkg.scripts.preview).toBe('vite preview --port 5000');
    expect(pkg.scripts.dev).toBe('vite dev');
    expect(stdout).toContain('kept your "preview" script');
  });

  it('leaves user-added scripts untouched', () => {
    seedProject(testDir, {
      scripts: { dev: 'vite dev', export: 'vite build', validate: 'tessera-validate', lint: 'eslint .' },
    });
    runCLI('upgrade', testDir);
    expect(readPkg(testDir).scripts.lint).toBe('eslint .');
  });

  it('keeps an authored override of a framework script and warns', () => {
    seedProject(testDir, {
      scripts: { dev: 'vite dev --host', export: 'vite build', validate: 'tessera-validate' },
    });
    const { stdout } = runCLI('upgrade', testDir);
    expect(readPkg(testDir).scripts.dev).toBe('vite dev --host');
    expect(stdout).toContain('kept your "dev" script');
  });

  it('pins tessera-learn to the version the CLI ships', () => {
    seedProject(testDir, {
      scripts: { dev: 'vite dev', export: 'vite build', validate: 'tessera-validate' },
      tesseraVersion: '^0.0.1',
    });
    const { stdout } = runCLI('upgrade', testDir);
    expect(stdout).toContain('set tessera-learn');
    expect(readPkg(testDir).dependencies['tessera-learn']).toBe(TESSERA_VERSION);
  });

  it('overwrites framework-owned AGENTS.md and vite.config.js', () => {
    seedProject(testDir, {
      scripts: { dev: 'vite dev', export: 'vite build', validate: 'tessera-validate' },
      tesseraVersion: TESSERA_VERSION,
      agentsMd: '# stale agents file\n',
      viteConfig: '// stale vite config\n',
    });
    runCLI('upgrade', testDir);
    const agents = readFileSync(resolve(testDir, 'AGENTS.md'), 'utf-8');
    const vite = readFileSync(resolve(testDir, 'vite.config.js'), 'utf-8');
    expect(agents).toContain('Tessera Course Authoring Guide');
    expect(vite).toContain('tesseraPlugin()');
  });

  it('fails when run outside a project (no package.json)', () => {
    const { exitCode, stderr } = runCLI('upgrade', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('no package.json found');
  });

  it('fails when package.json has no tessera-learn dependency', () => {
    seedProject(testDir, { tesseraVersion: null });
    const { exitCode, stderr } = runCLI('upgrade', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('does not look like a Tessera project');
  });

  it('writes nothing with --dry-run', () => {
    seedProject(testDir, { scripts: { preview: 'vite dev' } });
    const before = readFileSync(resolve(testDir, 'package.json'), 'utf-8');
    const { stdout } = runCLI('upgrade --dry-run', testDir);
    expect(stdout).toContain('No files written');
    expect(readFileSync(resolve(testDir, 'package.json'), 'utf-8')).toBe(before);
    expect(existsSync(resolve(testDir, 'AGENTS.md'))).toBe(false);
  });

  it('reports nothing to do on a second run', () => {
    seedProject(testDir, { scripts: { preview: 'vite dev' } });
    runCLI('upgrade', testDir);
    const { stdout, exitCode } = runCLI('upgrade', testDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Already up to date');
  });

  it('rejects unknown options for the upgrade command', () => {
    seedProject(testDir);
    const { exitCode, stderr } = runCLI('upgrade --force', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown option');
  });
});
