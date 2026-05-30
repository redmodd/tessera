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
// into scaffolded projects.
const TESSERA_VERSION = ownPkg.version;

const USAGE = `Usage: create-tessera <project-name> [--template=<default|bare>]

Scaffold a new Tessera course.

Options:
  --template=<name>   Template to use ("default" or "bare", default: "default")
  --help, -h          Show this help

Examples:
  pnpm create tessera@latest my-course
  pnpm create tessera@latest my-course --template=bare

To update an existing course, bump the framework dependency from its root:
  pnpm add tessera-learn@latest
`;

type Template = 'default' | 'bare';

interface ParsedArgs {
  projectName?: string;
  template: Template;
}

interface ParseResult {
  args?: ParsedArgs;
  error?: string;
  help?: boolean;
}

export function parseArgs(argv: string[]): ParseResult {
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
// in practice the dirs are disjoint, so this is purely additive.
function scaffold(dir: string, template: Template, tokens: Tokens) {
  copyTemplate(resolve(PKG_ROOT, 'templates/base'), dir, tokens);
  copyTemplate(resolve(PKG_ROOT, 'templates', template), dir, tokens);
  // CLAUDE.md and AGENTS.md are the same pointer stub under two names so each
  // agent finds one (Claude Code reads CLAUDE.md, others read AGENTS.md). Mirror
  // one template instead of maintaining two identical files.
  copyFileSync(join(dir, 'AGENTS.md'), join(dir, 'CLAUDE.md'));
}

function fail(message: string): never {
  process.stderr.write(`Error: ${message}\n\n`);
  process.stderr.write(USAGE);
  process.exit(1);
}

function main() {
  const result = parseArgs(process.argv.slice(2));

  if (result.help) {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (result.error) fail(result.error);

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

  process.stdout.write(
    `\nCreated ${name} (${args.template} template).\n\nNext steps:\n  cd ${name}\n  pnpm install\n  pnpm dev\n`,
  );
}

// Only run the CLI when invoked as the entry point. Importing this module
// (e.g. from unit tests) returns the helpers without triggering main().
if (import.meta.main) {
  main();
}
