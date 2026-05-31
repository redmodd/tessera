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

// The first course every workspace ships with. `tessera new <name>` adds more.
const SEED_COURSE = 'getting-started';

const USAGE = `Usage: create-tessera <workspace-name> [--template=<default|bare>]

Scaffold a new Tessera workspace (a home for many courses).

Options:
  --template=<name>   First course's template ("default" or "bare", default: "default")
  --help, -h          Show this help

Examples:
  pnpm create tessera@latest my-courses
  pnpm create tessera@latest my-courses --template=bare

Add more courses to an existing workspace from its root:
  pnpm tessera new <name>

To update the framework, bump the dependency from the workspace root:
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

// Tokens substituted into text template files as they are copied. Delimiters use
// __UPPER__ in the templates so they cannot collide with Svelte `{...}` or JS
// `${...}`; copyTemplate (shared with `tessera new`) matches them by bare name.
type Tokens = Record<string, string>;

// Scaffold the workspace shell, then stamp the first course under courses/.
function scaffold(dir: string, template: Template, tokens: Tokens) {
  copyTemplate(resolve(PKG_ROOT, 'templates/workspace'), dir, tokens);
  // CLAUDE.md and AGENTS.md are the same pointer stub under two names so each
  // agent finds one (Claude Code reads CLAUDE.md, others read AGENTS.md). They
  // live only at the workspace root — `tessera new` never stamps per-course
  // pointers, and the @-import path resolves to node_modules only from here.
  copyFileSync(join(dir, 'AGENTS.md'), join(dir, 'CLAUDE.md'));

  const courseTemplate = template === 'bare' ? 'course-bare' : 'course';
  copyTemplate(
    resolve(PKG_ROOT, 'templates', courseTemplate),
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

  scaffold(projectDir, args.template, {
    PROJECT_NAME: name,
    PROJECT_TITLE: toTitleCase(SEED_COURSE),
    TESSERA_VERSION,
  });

  process.stdout.write(
    `\nCreated workspace ${name} (${args.template} template).\n\n` +
      `Next steps:\n  cd ${name}\n  pnpm install\n  pnpm dev\n\n` +
      `Add another course:\n  pnpm tessera new <name>\n`,
  );
}

// Only run the CLI when invoked as the entry point. Importing this module
// (e.g. from unit tests) returns the helpers without triggering main().
if (import.meta.main) {
  main();
}
