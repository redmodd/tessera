import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

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
    const stdout = execSync(`node ${CLI_PATH} ${args}`, {
      cwd,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...process.env, npm_config_yes: 'true' },
    });
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

// Build CLI before tests run
execSync('pnpm build', {
  cwd: resolve(__dirname, '..'),
  stdio: 'ignore',
});

describe('create-tessera CLI', () => {
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

  it('creates project directory with all template files', () => {
    // Skip npm install to keep test fast
    runCLI('test-course', testDir);
    // exitCode may be non-zero if npm install fails (tessera not published)
    // but the files should still be created

    const projectDir = resolve(testDir, 'test-course');
    expect(existsSync(projectDir)).toBe(true);

    // Core files
    expect(existsSync(resolve(projectDir, 'package.json'))).toBe(true);
    expect(existsSync(resolve(projectDir, 'course.config.js'))).toBe(true);
    expect(existsSync(resolve(projectDir, '.gitignore'))).toBe(true);
    expect(existsSync(resolve(projectDir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(resolve(projectDir, 'CLAUDE.md'))).toBe(true);

    // Pages structure
    expect(
      existsSync(resolve(projectDir, 'pages/01-getting-started/_meta.js')),
    ).toBe(true);
    expect(
      existsSync(
        resolve(projectDir, 'pages/01-getting-started/01-welcome/_meta.js'),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(
          projectDir,
          'pages/01-getting-started/01-welcome/welcome.svelte',
        ),
      ),
    ).toBe(true);

    // Styles & assets
    expect(existsSync(resolve(projectDir, 'styles/custom.css'))).toBe(true);
    expect(existsSync(resolve(projectDir, 'assets/.gitkeep'))).toBe(true);
  });

  it('package.json scripts are pure tessera aliases', () => {
    runCLI('my-course', testDir);
    const pkgPath = resolve(testDir, 'my-course', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    expect(pkg.name).toBe('my-course');
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.dev).toBe('tessera dev');
    expect(pkg.scripts.export).toBe('tessera export');
    expect(pkg.scripts.validate).toBe('tessera validate');
    expect(pkg.scripts.check).toBe('tessera check');
    expect(pkg.packageManager).toMatch(/^pnpm@/);
    expect(pkg.scripts['accessibility-check']).toBeUndefined();
    expect(pkg.dependencies['tessera-learn']).toBeDefined();
    // Vite and vite-plugin-svelte are owned by tessera-learn now, not scaffolded.
    expect(pkg.devDependencies.vite).toBeUndefined();
    expect(pkg.devDependencies['@sveltejs/vite-plugin-svelte']).toBeUndefined();
    // Optional a11y peers the author must hold directly to run `tessera check`.
    expect(pkg.devDependencies['@axe-core/playwright']).toBeDefined();
    expect(pkg.devDependencies.playwright).toBeDefined();
  });

  // A project running components against a different Svelte than tessera-learn
  // compiled them with breaks subtly, so the floors must allow a single version.
  it('scaffolds a svelte floor that matches tessera-learn', () => {
    runCLI('my-course', testDir);
    const scaffolded = JSON.parse(
      readFileSync(resolve(testDir, 'my-course', 'package.json'), 'utf-8'),
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

  it('scaffolds AGENTS.md/CLAUDE.md as identical pointers, not a copy of the guide', () => {
    runCLI('my-course', testDir);
    const agents = readFileSync(
      resolve(testDir, 'my-course', 'AGENTS.md'),
      'utf-8',
    );
    const claude = readFileSync(
      resolve(testDir, 'my-course', 'CLAUDE.md'),
      'utf-8',
    );
    expect(claude).toBe(agents);
    expect(agents).toContain('@./node_modules/tessera-learn/AGENTS.md');
    // A pointer, not the full guide — keep it tiny.
    expect(agents.length).toBeLessThan(2000);
  });

  it('course.config.js has title derived from project name', () => {
    runCLI('my-awesome-course', testDir);
    const content = readFileSync(
      resolve(testDir, 'my-awesome-course', 'course.config.js'),
      'utf-8',
    );
    expect(content).toContain("title: 'My Awesome Course'");
  });

  it('welcome.svelte includes project title', () => {
    runCLI('my-course', testDir);
    const content = readFileSync(
      resolve(
        testDir,
        'my-course',
        'pages/01-getting-started/01-welcome/welcome.svelte',
      ),
      'utf-8',
    );
    expect(content).toContain('Welcome to My Course');
    expect(content).toContain('pageConfig');
  });

  it('_meta.js files have correct content', () => {
    runCLI('my-course', testDir);

    const sectionMeta = readFileSync(
      resolve(testDir, 'my-course', 'pages/01-getting-started/_meta.js'),
      'utf-8',
    );
    expect(sectionMeta).toContain('Getting Started');

    const lessonMeta = readFileSync(
      resolve(
        testDir,
        'my-course',
        'pages/01-getting-started/01-welcome/_meta.js',
      ),
      'utf-8',
    );
    expect(lessonMeta).toContain('Welcome');
    expect(lessonMeta).toContain('pages:');
  });

  it('.gitignore includes expected entries', () => {
    runCLI('my-course', testDir);
    const content = readFileSync(
      resolve(testDir, 'my-course', '.gitignore'),
      'utf-8',
    );
    expect(content).toContain('node_modules');
    expect(content).toContain('dist');
    expect(content).toContain('.DS_Store');
  });

  it('renames dotfiles on copy (.gitignore / .gitkeep, never the underscore form)', () => {
    runCLI('dotfile-course', testDir);
    const projectDir = resolve(testDir, 'dotfile-course');
    expect(existsSync(resolve(projectDir, '.gitignore'))).toBe(true);
    expect(existsSync(resolve(projectDir, '_gitignore'))).toBe(false);
    expect(existsSync(resolve(projectDir, 'assets/.gitkeep'))).toBe(true);
    expect(existsSync(resolve(projectDir, 'assets/_gitkeep'))).toBe(false);
  });

  it('leads the "Next steps" hint with pnpm', () => {
    const stdout = execSync(`node ${CLI_PATH} pnpm-course`, {
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
    expect(stdout).toContain('pnpm dev');
    expect(stdout).not.toContain('npm run dev');
  });

  it('errors on unknown --template value', () => {
    const { stderr, exitCode } = runCLI('my-course --template=fancy', testDir);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Unknown template');
  });

  describe('--template=bare', () => {
    it('creates a layout.svelte at project root', () => {
      runCLI('bare-course --template=bare', testDir);
      const layoutPath = resolve(testDir, 'bare-course', 'layout.svelte');
      expect(existsSync(layoutPath)).toBe(true);
      const layout = readFileSync(layoutPath, 'utf-8');
      expect(layout).toContain("from 'tessera-learn'");
      expect(layout).toContain('useNavigation');
      expect(layout).toContain('useProgress');
      expect(layout).toContain('{@render page()}');
    });

    it('creates pages that use useQuestion hook', () => {
      runCLI('bare-course --template=bare', testDir);
      const checkPagePath = resolve(
        testDir,
        'bare-course',
        'pages/01-course/01-lesson/check.svelte',
      );
      expect(existsSync(checkPagePath)).toBe(true);
      const checkPage = readFileSync(checkPagePath, 'utf-8');
      expect(checkPage).toContain('useQuestion');
      expect(checkPage).toContain("type: 'choice'");
    });

    it('does NOT scaffold built-in component imports', () => {
      runCLI('bare-course --template=bare', testDir);
      const introPath = resolve(
        testDir,
        'bare-course',
        'pages/01-course/01-lesson/intro.svelte',
      );
      const intro = readFileSync(introPath, 'utf-8');
      expect(intro).not.toContain('Callout');
      expect(intro).not.toContain('<Quiz');
      expect(intro).not.toContain('<Image');
    });

    it('writes a minimal course.config.js without branding boilerplate', () => {
      runCLI('bare-course --template=bare', testDir);
      const config = readFileSync(
        resolve(testDir, 'bare-course', 'course.config.js'),
        'utf-8',
      );
      expect(config).toContain("title: 'Bare Course'");
      expect(config).toContain("export: { standard: 'web' }");
      expect(config).not.toContain('branding');
    });

    it('does not scaffold a README (authors add their own)', () => {
      runCLI('bare-course --template=bare', testDir);
      expect(existsSync(resolve(testDir, 'bare-course', 'README.md'))).toBe(
        false,
      );
    });

    it('still writes AGENTS.md, CLAUDE.md, and package.json', () => {
      runCLI('bare-course --template=bare', testDir);
      const projectDir = resolve(testDir, 'bare-course');
      expect(existsSync(resolve(projectDir, 'AGENTS.md'))).toBe(true);
      expect(existsSync(resolve(projectDir, 'CLAUDE.md'))).toBe(true);
      expect(existsSync(resolve(projectDir, 'package.json'))).toBe(true);
    });

    it('scaffolds empty styles/ and assets/ folders', () => {
      runCLI('bare-course --template=bare', testDir);
      const projectDir = resolve(testDir, 'bare-course');
      expect(existsSync(resolve(projectDir, 'styles/.gitkeep'))).toBe(true);
      expect(existsSync(resolve(projectDir, 'assets/.gitkeep'))).toBe(true);
    });
  });
});
