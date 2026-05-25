import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ownPkg = JSON.parse(
  readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf-8'),
) as { version: string };
// create-tessera and tessera-learn release in lockstep via the changesets
// `fixed` group (not `linked`, which would not co-publish tessera-learn), so the
// version this CLI ships at always has a matching published tessera-learn to pin
// into scaffolded and upgraded projects.
const TESSERA_VERSION = ownPkg.version;

const USAGE = `Usage: create-tessera <project-name> [--template=<default|bare>]
       create-tessera upgrade [--dry-run]

Scaffold a new Tessera course, or upgrade an existing one in the current directory.

Options:
  --template=<name>   Template to use ("default" or "bare", default: "default")
  --dry-run           (upgrade) Preview changes without writing any files
  --help, -h          Show this help

Examples:
  npm create tessera@latest my-course
  npm create tessera@latest my-course -- --template=bare
  npx create-tessera@latest upgrade
`;

type Template = 'default' | 'bare';

interface ParsedArgs {
  projectName?: string;
  template: Template;
}

interface ParseResult {
  args?: ParsedArgs;
  upgrade?: { dryRun: boolean };
  error?: string;
  help?: boolean;
}

export function parseArgs(argv: string[]): ParseResult {
  if (argv[0] === 'upgrade') {
    let dryRun = false;
    for (const a of argv.slice(1)) {
      if (a === '--help' || a === '-h') return { help: true };
      if (a === '--dry-run') dryRun = true;
      else return { error: `Unknown option "${a}" for the upgrade command` };
    }
    return { upgrade: { dryRun } };
  }

  const args: ParsedArgs = { template: 'default' };
  for (const a of argv) {
    if (a === '--help' || a === '-h') return { help: true };
    if (a.startsWith('--template=')) {
      const v = a.slice('--template='.length);
      if (v !== 'default' && v !== 'bare') {
        return {
          error: `Unknown template "${v}". Valid templates: default, bare`,
        };
      }
      args.template = v;
    } else if (a.startsWith('-')) {
      return { error: `Unknown option "${a}"` };
    } else if (!args.projectName) {
      args.projectName = a;
    } else {
      return { error: `Unexpected argument "${a}"` };
    }
  }
  return { args };
}

// npm package name rules: 1-214 chars, lowercase, must start with [a-z0-9],
// allowed chars [a-z0-9._-], no leading dot or underscore.
export function validateProjectName(name: string): string | null {
  if (!name) return 'Project name is required';
  if (name.length > 214) return 'Project name must be 214 characters or fewer';
  if (name !== name.toLowerCase()) return 'Project name must be lowercase';
  if (!/^[a-z0-9]/.test(name)) {
    return 'Project name must start with a letter or digit';
  }
  if (!/^[a-z0-9._-]+$/.test(name)) {
    return 'Project name may only contain lowercase letters, digits, "-", "_", and "."';
  }
  return null;
}

export function toTitleCase(slug: string): string {
  return slug
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function copyAgentsMd(dest: string) {
  copyFileSync(resolve(PKG_ROOT, 'AGENTS.md'), dest);
}

// Framework-owned npm scripts — reserved names. The scaffold writes them
// verbatim (via base/package.json) and `upgrade` reconciles them against an
// existing package.json. base/package.json's "scripts" must match this map; a
// unit test enforces the two stay in sync.
export const FRAMEWORK_SCRIPTS: Record<string, string> = {
  dev: 'vite dev',
  export: 'vite build',
  validate: 'tessera-validate',
  'accessibility-check': 'tessera-a11y',
};

// Framework scripts that were renamed across versions. On upgrade a stale key
// is removed only when its value still matches the framework's old value — a
// diverged value means the author repurposed the name, so it is left alone.
interface ScriptMigration {
  stale: string;
  oldValue: string;
  replacedBy: string;
}
const SCRIPT_MIGRATIONS: ScriptMigration[] = [
  { stale: 'preview', oldValue: 'vite dev', replacedBy: 'dev' },
];

// Tokens substituted into text template files as they are copied. Delimiters use
// __UPPER__ so they cannot collide with Svelte `{...}` or JS `${...}`.
interface Tokens {
  __PROJECT_NAME__: string; // validated slug
  __PROJECT_TITLE__: string; // toTitleCase(slug)
  __TESSERA_VERSION__: string; // TESSERA_VERSION
}

// npm's tarball packing strips/renames leading-dot files, so templates store
// them prefixed and we restore the dot on copy. (create-vite convention.)
const RENAME: Record<string, string> = {
  _gitignore: '.gitignore',
  _gitkeep: '.gitkeep',
};

// Text files get token substitution; everything else (renamed dotfiles, future
// binary assets like a logo) is copied byte-for-byte so it is never mangled by
// applyTokens.
const TEXT = /\.(svelte|js|ts|json|css|md|html)$/;

function applyTokens(s: string, t: Tokens): string {
  return s.replace(
    /__(PROJECT_NAME|PROJECT_TITLE|TESSERA_VERSION)__/g,
    (m) => t[m as keyof Tokens],
  );
}

function copyTemplate(srcDir: string, destDir: string, tokens: Tokens) {
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, RENAME[entry.name] ?? entry.name);
    if (entry.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      copyTemplate(src, dest, tokens);
    } else if (TEXT.test(entry.name)) {
      writeFileSync(dest, applyTokens(readFileSync(src, 'utf-8'), tokens));
    } else {
      copyFileSync(src, dest);
    }
  }
}

// Layer base/ then the chosen variant; the variant wins on path collisions, but
// in practice the dirs are disjoint, so this is purely additive. AGENTS.md lives
// at the package root (canonical, framework-owned) and is copied separately.
function scaffold(dir: string, template: Template, tokens: Tokens) {
  copyTemplate(resolve(PKG_ROOT, 'templates/base'), dir, tokens);
  copyTemplate(resolve(PKG_ROOT, 'templates', template), dir, tokens);
  copyAgentsMd(join(dir, 'AGENTS.md'));
}

// Package-manager-aware post-scaffold hints. Detection keys off the
// npm_config_user_agent every PM sets when running `create`; a miss falls back
// to npm with no functional impact (the hint is cosmetic).
type PM = 'npm' | 'pnpm' | 'yarn' | 'bun';

export function detectPackageManager(): PM {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('bun')) return 'bun';
  return 'npm';
}

const INSTALL: Record<PM, string> = {
  npm: 'npm install',
  pnpm: 'pnpm install',
  yarn: 'yarn',
  bun: 'bun install',
};
const RUN: Record<PM, string> = {
  npm: 'npm run',
  pnpm: 'pnpm',
  yarn: 'yarn',
  bun: 'bun run',
};

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n\n`);
  process.stderr.write(USAGE);
  process.exit(1);
}

function failPlain(message: string): never {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

// Re-apply framework-owned files to an existing project in the current
// directory. Authored files (course.config.js, pages/, styles/, layout.svelte,
// README.md) are never touched. package.json is merged key-by-key; AGENTS.md
// and vite.config.js are framework-owned and overwritten.
function upgrade(dryRun: boolean) {
  const cwd = process.cwd();
  const pkgPath = resolve(cwd, 'package.json');

  if (!existsSync(pkgPath)) {
    failPlain('no package.json found — run this from a Tessera project root');
  }

  let pkg: {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  } catch {
    failPlain('package.json is not valid JSON');
  }

  if (!pkg.dependencies?.['tessera-learn']) {
    failPlain(
      'this does not look like a Tessera project (no "tessera-learn" dependency in package.json)',
    );
  }

  const changes: string[] = [];
  const warnings: string[] = [];
  let pkgChanged = false;

  const scripts = (pkg.scripts ??= {});

  // Renamed framework scripts: drop the stale key only when untouched.
  for (const m of SCRIPT_MIGRATIONS) {
    if (!(m.stale in scripts)) continue;
    if (scripts[m.stale] === m.oldValue) {
      delete scripts[m.stale];
      pkgChanged = true;
      changes.push(
        `package.json: removed stale "${m.stale}" script (renamed to "${m.replacedBy}")`,
      );
    } else {
      warnings.push(
        `package.json: kept your "${m.stale}" script — its value differs from the framework default, so it is treated as yours`,
      );
    }
  }

  // Framework scripts: add when missing, leave authored overrides alone.
  for (const [name, value] of Object.entries(FRAMEWORK_SCRIPTS)) {
    const current = scripts[name];
    if (current === undefined) {
      scripts[name] = value;
      pkgChanged = true;
      changes.push(`package.json: added "${name}" script`);
    } else if (current !== value) {
      warnings.push(
        `package.json: kept your "${name}" script — its value differs from the framework default ("${value}"), so it is treated as yours`,
      );
    }
  }

  // Framework-owned dependency: pin to the version this CLI ships.
  const currentDep = pkg.dependencies!['tessera-learn'];
  if (currentDep !== TESSERA_VERSION) {
    pkg.dependencies!['tessera-learn'] = TESSERA_VERSION;
    pkgChanged = true;
    changes.push(
      `package.json: set tessera-learn to "${TESSERA_VERSION}" (was "${currentDep}")`,
    );
  }

  if (pkgChanged && !dryRun) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // Framework-owned files: straight overwrite. These are read verbatim (no token
  // substitution), so they must stay token-free; a unit test enforces that.
  const overwrites: { name: string; dest: string; content: string }[] = [
    {
      name: 'AGENTS.md',
      dest: resolve(cwd, 'AGENTS.md'),
      content: readFileSync(resolve(PKG_ROOT, 'AGENTS.md'), 'utf-8'),
    },
    {
      name: 'vite.config.js',
      dest: resolve(cwd, 'vite.config.js'),
      content: readFileSync(
        resolve(PKG_ROOT, 'templates/base/vite.config.js'),
        'utf-8',
      ),
    },
  ];

  for (const f of overwrites) {
    if (!existsSync(f.dest)) {
      if (!dryRun) writeFileSync(f.dest, f.content);
      changes.push(`${f.name}: created`);
    } else if (readFileSync(f.dest, 'utf-8') !== f.content) {
      if (!dryRun) writeFileSync(f.dest, f.content);
      changes.push(`${f.name}: updated to the current framework version`);
      if (f.name === 'vite.config.js') {
        warnings.push(
          'vite.config.js: replaced with the framework version — if you had customizations, re-apply them',
        );
      }
    }
  }

  if (changes.length === 0) {
    process.stdout.write('Already up to date — nothing to upgrade.\n');
    for (const w of warnings) process.stdout.write(`  warning: ${w}\n`);
    return;
  }

  process.stdout.write(
    `\n${dryRun ? 'Would apply' : 'Applied'} ${changes.length} change(s):\n`,
  );
  for (const c of changes) process.stdout.write(`  ${c}\n`);
  if (warnings.length) {
    process.stdout.write(`\nWarnings:\n`);
    for (const w of warnings) process.stdout.write(`  ${w}\n`);
  }
  process.stdout.write(
    dryRun
      ? '\nNo files written (--dry-run). Re-run without --dry-run to apply.\n'
      : '\nDone. Run "npm install" to pick up dependency changes.\n',
  );
}

function main() {
  const result = parseArgs(process.argv.slice(2));

  if (result.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (result.error) fail(result.error);

  if (result.upgrade) {
    upgrade(result.upgrade.dryRun);
    return;
  }

  const args = result.args!;
  if (!args.projectName) {
    process.stderr.write(USAGE);
    process.exit(1);
  }

  const nameError = validateProjectName(args.projectName);
  if (nameError) fail(nameError);

  const name = args.projectName;
  const title = toTitleCase(name);
  const projectDir = resolve(process.cwd(), name);

  if (existsSync(projectDir)) {
    process.stderr.write(`Error: directory "${name}" already exists\n`);
    process.exit(1);
  }

  mkdirSync(projectDir, { recursive: true });

  scaffold(projectDir, args.template, {
    __PROJECT_NAME__: name,
    __PROJECT_TITLE__: title,
    __TESSERA_VERSION__: TESSERA_VERSION,
  });

  const pm = detectPackageManager();
  process.stdout.write(
    `\nCreated ${name} (${args.template} template).\n\nNext steps:\n  cd ${name}\n  ${INSTALL[pm]}\n  ${RUN[pm]} dev\n`,
  );
}

// Only run the CLI when invoked as the entry point. Importing this module
// (e.g. from unit tests) returns the helpers without triggering main().
if (import.meta.main) {
  main();
}
