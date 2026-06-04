import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, execSync } from 'node:child_process';

let testDir: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(
    tmpdir(),
    `tessera-scaffold-test-${Date.now()}-${counter}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

// Path to the built CLI
const CLI_PATH = resolve(__dirname, '..', 'dist', 'index.js');

function runCLI(
  args: string,
  cwd: string,
): { stdout: string; stderr: string; output: string; exitCode: number } {
  try {
    const stdout = execFileSync(
      'node',
      [CLI_PATH, ...args.split(/\s+/).filter(Boolean)],
      {
        cwd,
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, npm_config_yes: 'true' },
      },
    );
    return { stdout, stderr: '', output: stdout, exitCode: 0 };
  } catch (err: any) {
    const stdout = err.stdout?.toString() || '';
    const stderr = err.stderr?.toString() || '';
    return {
      stdout,
      stderr,
      output: stdout + stderr,
      exitCode: err.status ?? 1,
    };
  }
}

beforeEach(() => {
  testDir = createTestDir();
});

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {}
});

// Build CLI (and sync templates) before tests run.
execSync('pnpm build', {
  cwd: resolve(__dirname, '..'),
  stdio: 'ignore',
});

const SEED = 'courses/starter-course';

describe('create-tessera workspace scaffold', () => {
  it('prints usage when no arguments provided', () => {
    const { output, exitCode } = runCLI('', testDir);
    expect(exitCode).toBe(1);
    expect(output).toContain('Usage:');
  });

  it('prints usage with --help', () => {
    const { stdout, exitCode } = runCLI('--help', testDir);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage:');
  });

  it('errors when directory already exists', () => {
    mkdirSync(resolve(testDir, 'existing-dir'));
    const { stderr, exitCode } = runCLI('existing-dir', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('already exists');
  });

  it('errors on unknown flags', () => {
    const { stderr, exitCode } = runCLI('--version', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown option');
  });

  it('emits the workspace shell at the root', () => {
    runCLI('my-courses', testDir);
    const ws = resolve(testDir, 'my-courses');
    expect(existsSync(resolve(ws, 'package.json'))).toBe(true);
    expect(existsSync(resolve(ws, '.gitignore'))).toBe(true);
    expect(existsSync(resolve(ws, 'AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(ws, 'CLAUDE.md'))).toBe(true);
    expect(existsSync(resolve(ws, 'README.md'))).toBe(true);
    expect(existsSync(resolve(ws, 'shared/Button.svelte'))).toBe(true);
    expect(existsSync(resolve(ws, 'shared/tokens.css'))).toBe(true);
    // No course content at the workspace root — courses live under courses/.
    expect(existsSync(resolve(ws, 'course.config.js'))).toBe(false);
    expect(existsSync(resolve(ws, 'pages'))).toBe(false);
  });

  it('lands the first course under courses/starter-course', () => {
    runCLI('my-courses', testDir);
    const ws = resolve(testDir, 'my-courses');
    expect(existsSync(resolve(ws, SEED, 'course.config.js'))).toBe(true);
    expect(existsSync(resolve(ws, SEED, 'layout.svelte'))).toBe(true);
    expect(
      existsSync(resolve(ws, SEED, 'pages/01-getting-started/_meta.js')),
    ).toBe(true);
    expect(existsSync(resolve(ws, SEED, 'styles/custom.css'))).toBe(true);
  });

  it('uses pass-through root scripts so an explicit course is forwarded', () => {
    runCLI('my-courses', testDir);
    const pkg = JSON.parse(
      readFileSync(resolve(testDir, 'my-courses', 'package.json'), 'utf-8'),
    );
    expect(pkg.name).toBe('my-courses');
    expect(pkg.private).toBe(true);
    expect(pkg.scripts.dev).toBe('tessera dev');
    expect(pkg.scripts.export).toBe('tessera export');
    expect(pkg.scripts.validate).toBe('tessera validate');
    expect(pkg.scripts.a11y).toBe('tessera a11y');
    expect(pkg.scripts.check).toBe('tessera check');
    expect(pkg.scripts.new).toBe('tessera new');
    expect(pkg.dependencies['tessera-learn']).toBeDefined();
    expect(pkg.devDependencies['@axe-core/playwright']).toBeDefined();
    expect(pkg.devDependencies.playwright).toBeDefined();
    expect(pkg.devDependencies.vite).toBeUndefined();
  });

  it('pins a svelte floor that matches tessera-learn', () => {
    runCLI('my-courses', testDir);
    const scaffolded = JSON.parse(
      readFileSync(resolve(testDir, 'my-courses', 'package.json'), 'utf-8'),
    );
    const framework = JSON.parse(
      readFileSync(
        resolve(__dirname, '..', '..', 'tessera-learn', 'package.json'),
        'utf-8',
      ),
    );
    expect(scaffolded.devDependencies.svelte).toBe(
      framework.dependencies.svelte,
    );
  });

  it('scaffolds AGENTS.md/CLAUDE.md as identical root pointers, not a copy of the guide', () => {
    runCLI('my-courses', testDir);
    const ws = resolve(testDir, 'my-courses');
    const agents = readFileSync(resolve(ws, 'AGENTS.md'), 'utf-8');
    const claude = readFileSync(resolve(ws, 'CLAUDE.md'), 'utf-8');
    expect(claude).toBe(agents);
    expect(agents).toContain('@./node_modules/tessera-learn/AGENTS.md');
    expect(agents.length).toBeLessThan(2000);
    // Pointers live only at the root — never stamped per course.
    expect(existsSync(resolve(ws, SEED, 'AGENTS.md'))).toBe(false);
  });

  it('scaffolds a human-facing README headed by the workspace name, not the guide', () => {
    runCLI('my-courses', testDir);
    const readme = readFileSync(
      resolve(testDir, 'my-courses', 'README.md'),
      'utf-8',
    );
    expect(readme).toContain('# my-courses');
    expect(readme).toContain('pnpm install');
    expect(readme).toContain('pnpm dev starter-course');
    // Points at the guide rather than duplicating it.
    expect(readme).toContain('AGENTS.md');
    expect(readme).not.toContain('@./node_modules/tessera-learn/AGENTS.md');
  });

  it('derives the seed course title from the course name', () => {
    runCLI('my-courses', testDir);
    const config = readFileSync(
      resolve(testDir, 'my-courses', SEED, 'course.config.js'),
      'utf-8',
    );
    expect(config).toContain("title: 'Starter Course'");
  });

  it('renames dotfiles on copy', () => {
    runCLI('dotfile-courses', testDir);
    const ws = resolve(testDir, 'dotfile-courses');
    expect(existsSync(resolve(ws, '.gitignore'))).toBe(true);
    expect(existsSync(resolve(ws, '_gitignore'))).toBe(false);
  });

  it('leads the "Next steps" hint with pnpm and shows how to add courses', () => {
    const stdout = execFileSync('node', [CLI_PATH, 'pnpm-courses'], {
      cwd: testDir,
      encoding: 'utf-8',
      timeout: 30000,
      env: {
        ...process.env,
        npm_config_yes: 'true',
        npm_config_user_agent: 'npm/10.5.0 node/v24.0.0',
      },
    });
    expect(stdout).toContain('pnpm install');
    expect(stdout).toContain('pnpm dev starter-course');
    expect(stdout).toContain('tessera new');
    expect(stdout).not.toContain('npm run dev');
  });

  it('rejects an unknown flag', () => {
    const { stderr, exitCode } = runCLI('my-courses --template=bare', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown option');
  });
});

// The build syncs tessera-learn's course templates into create-tessera; drift
// would ship a stale course. (The `pnpm build` above runs the sync first.)
describe('course template build-sync', () => {
  const copyRoot = resolve(__dirname, '..', 'templates');
  const sourceRoot = resolve(
    __dirname,
    '..',
    '..',
    'tessera-learn',
    'templates',
  );

  function relFiles(dir: string, base: string = dir): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      return e.isDirectory() ? relFiles(p, base) : [relative(base, p)];
    });
  }

  it.each(['course'])(
    'the synced %s copy byte-matches tessera-learn (no drift)',
    (name) => {
      const src = join(sourceRoot, name);
      const copy = join(copyRoot, name);
      const srcFiles = relFiles(src).sort();
      expect(relFiles(copy).sort()).toEqual(srcFiles);
      for (const f of srcFiles) {
        expect(readFileSync(join(copy, f))).toEqual(readFileSync(join(src, f)));
      }
    },
  );
});
