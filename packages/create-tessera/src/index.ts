import { existsSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProjectName, toTitleCase } from 'tessera-learn/project-name';
import { copyTemplate } from 'tessera-learn/template-copy';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ownPkg = JSON.parse(
  readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf-8'),
) as { version: string };
// create-tessera and tessera-learn release in lockstep via the changesets
// `fixed` group (not `linked`, which would not co-publish tessera-learn), so the
// version this CLI ships at always has a matching published tessera-learn to pin
// into scaffolded workspaces.
const TESSERA_VERSION = ownPkg.version;

// Injected at build time from tessera-learn's svelte pin (see tsdown.config.ts).
declare const __SVELTE_VERSION__: string | undefined;
const SVELTE_VERSION =
  typeof __SVELTE_VERSION__ !== 'undefined' ? __SVELTE_VERSION__ : '';

// The first course every workspace ships with. `tessera new <name>` adds more.
const SEED_COURSE = 'starter-course';

const USAGE = `Usage: create-tessera <workspace-name>

Scaffold a new Tessera workspace (a home for many courses).

Options:
  --help, -h          Show this help

Examples:
  pnpm create tessera@latest my-courses

Add more courses to an existing workspace from its root:
  pnpm tessera new <name>

To update the framework, bump the dependency from the workspace root:
  pnpm add tessera-learn@latest
`;

interface ParsedArgs {
  projectName?: string;
}

interface ParseResult {
  args?: ParsedArgs;
  error?: string;
  help?: boolean;
}

export function parseArgs(argv: string[]): ParseResult {
  const args: ParsedArgs = {};
  for (const a of argv) {
    if (a === '--help' || a === '-h') return { help: true };
    if (a.startsWith('-')) {
      return { error: `Unknown option "${a}"` };
    } else if (!args.projectName) {
      args.projectName = a;
    } else {
      return { error: `Unexpected argument "${a}"` };
    }
  }
  return { args };
}

// __UPPER__ delimiters can't collide with Svelte `{...}` or JS `${...}`;
// copyTemplate (shared with `tessera new`) matches them by bare name.
type Tokens = Record<string, string>;

// Scaffold the workspace shell, then stamp the first course under courses/.
function scaffold(dir: string, tokens: Tokens) {
  copyTemplate(resolve(PKG_ROOT, 'templates/workspace'), dir, tokens);
  // CLAUDE.md and AGENTS.md are the same pointer stub under two names so each
  // agent finds one (Claude Code reads CLAUDE.md, others read AGENTS.md). They
  // live only at the workspace root — `tessera new` never stamps per-course
  // pointers, and the @-import path resolves to node_modules only from here.
  copyFileSync(join(dir, 'AGENTS.md'), join(dir, 'CLAUDE.md'));

  copyTemplate(
    resolve(PKG_ROOT, 'templates', 'course'),
    join(dir, 'courses', SEED_COURSE),
    tokens,
  );
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
  const projectDir = resolve(process.cwd(), name);

  if (existsSync(projectDir)) {
    process.stderr.write(`Error: directory "${name}" already exists\n`);
    process.exit(1);
  }

  mkdirSync(projectDir, { recursive: true });

  scaffold(projectDir, {
    PROJECT_NAME: name,
    PROJECT_TITLE: toTitleCase(SEED_COURSE),
    TESSERA_VERSION,
    SVELTE_VERSION,
  });

  process.stdout.write(
    `\nCreated workspace ${name}.\n\n` +
      `Next steps:\n  cd ${name}\n  pnpm install\n  pnpm dev ${SEED_COURSE}\n\n` +
      `Add another course:\n  pnpm tessera new <name>\n`,
  );
}

// Only run the CLI when invoked as the entry point. Importing this module
// (e.g. from unit tests) returns the helpers without triggering main().
if (import.meta.main) {
  main();
}
