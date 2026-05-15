import {
  existsSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ownPkg = JSON.parse(
  readFileSync(resolve(PKG_ROOT, 'package.json'), 'utf-8')
) as { tesseraVersion?: string };
const TESSERA_VERSION = ownPkg.tesseraVersion ?? 'latest';

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
        return { error: `Unknown template "${v}". Valid templates: default, bare` };
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

function write(path: string, content: string) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function copyAgentsMd(dest: string) {
  copyFileSync(resolve(PKG_ROOT, 'AGENTS.md'), dest);
}

// Framework-owned npm scripts — reserved names. The scaffold writes them
// verbatim and `upgrade` reconciles them against an existing package.json.
const FRAMEWORK_SCRIPTS: Record<string, string> = {
  dev: 'vite dev',
  export: 'vite build',
  validate: 'tessera-validate',
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

function packageJson(name: string): string {
  const pkg = {
    name,
    private: true,
    type: 'module',
    scripts: { ...FRAMEWORK_SCRIPTS },
    dependencies: {
      'tessera-learn': TESSERA_VERSION,
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '^7.1.2',
      svelte: '^5.0.0',
      vite: '^8.0.0',
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

const VITE_CONFIG = `import { tesseraPlugin } from 'tessera-learn/plugin';

export default {
  plugins: [tesseraPlugin()],
};
`;

const GITIGNORE = `node_modules
dist
.DS_Store
*.log
.env
.env.local
`;

function defaultCourseConfig(title: string): string {
  return `export default {
  title: ${JSON.stringify(title)},
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  branding: {
    primaryColor: "#0066cc",
  },
  export: { standard: "web" },
};
`;
}

function bareCourseConfig(title: string): string {
  return `export default {
  title: ${JSON.stringify(title)},
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};
`;
}

function welcomePage(title: string): string {
  return `<script module>
  export const pageConfig = { title: "Welcome" };
</script>

<h1>Welcome to ${title}</h1>

<p>
  This is a basic demo page of your Tessera course.
</p>

<p>
  Point your agent to <code>AGENTS.md</code> at the project root for the authoring guide.
</p>
`;
}

const DEFAULT_CUSTOM_CSS = `/* Project-level CSS overrides.
 * Imported automatically by Tessera. Use this file for tweaks on top of the
 * default theme. For deeper customisation, see the "Theming" section in
 * AGENTS.md.
 */
`;

function bareLayout(title: string): string {
  return `<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<header>
  <h1>${title}</h1>
  <span>{progress.visitedPages.size} / {nav.pages.length}</span>
</header>

<main>
  {@render page()}
</main>

<footer>
  <button disabled={!nav.canGoPrev} onclick={() => nav.prev()}>Previous</button>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next</button>
</footer>
`;
}

function bareIntro(title: string): string {
  return `<script module>
  export const pageConfig = { title: "Intro" };
</script>

<h1>${title}</h1>

<p>
  This is a bare Tessera project. The shell around this page is rendered by the
  <code>layout.svelte</code> at the project root — replace it to fit your design.
</p>
`;
}

const BARE_CHECK = `<script module>
  export const pageConfig = { title: "Check" };
</script>

<script>
  import { useQuestion } from 'tessera-learn';

  let selected = $state(null);

  const q = useQuestion({
    id: 'check-1',
    response: () => ({
      type: 'choice',
      response: selected !== null ? [selected] : [],
      correct: ['a'],
    }),
    reset: () => { selected = null; },
  });
</script>

<h1>Quick check</h1>

<p>Tessera locks the data contract. Which option captures that?</p>

<fieldset disabled={q.submitted}>
  <label>
    <input type="radio" bind:group={selected} value="a" />
    Tessera locks the data contract.
  </label>
  <label>
    <input type="radio" bind:group={selected} value="b" />
    Tessera locks the presentation.
  </label>
</fieldset>

<button onclick={() => q.submit()} disabled={q.submitted || selected === null}>
  Submit
</button>

{#if q.submitted}
  <p>{q.correct ? 'Correct.' : 'Not quite — review the intro.'}</p>
{/if}
`;

function bareReadme(title: string): string {
  return `# ${title}

Bare Tessera project. The course shell lives in \`layout.svelte\` at the project
root and pages live under \`pages/\`. Built-in components are not imported by
default — bring your own UI.

## Run locally

\`\`\`bash
npm install
npm run dev
\`\`\`

## Structure

- \`layout.svelte\` — course shell (header / main / footer)
- \`pages/\` — sections → lessons → \`.svelte\` pages
- \`course.config.js\` — title, navigation, completion, scoring, export target
- \`AGENTS.md\` — authoring guide

## Build

\`\`\`bash
npm run export
\`\`\`
`;
}

function scaffoldDefault(dir: string, name: string, title: string) {
  write(join(dir, 'package.json'), packageJson(name));
  write(join(dir, 'vite.config.js'), VITE_CONFIG);
  write(join(dir, 'course.config.js'), defaultCourseConfig(title));
  write(join(dir, '.gitignore'), GITIGNORE);
  copyAgentsMd(join(dir, 'AGENTS.md'));

  write(
    join(dir, 'pages/01-getting-started/_meta.js'),
    `export default { title: "Getting Started" };\n`
  );
  write(
    join(dir, 'pages/01-getting-started/01-welcome/_meta.js'),
    `export default { title: "Welcome", pages: ["welcome"] };\n`
  );
  write(
    join(dir, 'pages/01-getting-started/01-welcome/welcome.svelte'),
    welcomePage(title)
  );

  write(join(dir, 'styles/custom.css'), DEFAULT_CUSTOM_CSS);
  write(join(dir, 'assets/.gitkeep'), '');
}

function scaffoldBare(dir: string, name: string, title: string) {
  write(join(dir, 'package.json'), packageJson(name));
  write(join(dir, 'vite.config.js'), VITE_CONFIG);
  write(join(dir, 'course.config.js'), bareCourseConfig(title));
  write(join(dir, '.gitignore'), GITIGNORE);
  copyAgentsMd(join(dir, 'AGENTS.md'));
  write(join(dir, 'README.md'), bareReadme(title));
  write(join(dir, 'layout.svelte'), bareLayout(title));

  write(
    join(dir, 'pages/01-course/_meta.js'),
    `export default { title: "Course" };\n`
  );
  write(
    join(dir, 'pages/01-course/01-lesson/_meta.js'),
    `export default { title: "Lesson", pages: ["intro", "check"] };\n`
  );
  write(join(dir, 'pages/01-course/01-lesson/intro.svelte'), bareIntro(title));
  write(join(dir, 'pages/01-course/01-lesson/check.svelte'), BARE_CHECK);

  write(join(dir, 'styles/.gitkeep'), '');
  write(join(dir, 'assets/.gitkeep'), '');
}

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
      'this does not look like a Tessera project (no "tessera-learn" dependency in package.json)'
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
        `package.json: removed stale "${m.stale}" script (renamed to "${m.replacedBy}")`
      );
    } else {
      warnings.push(
        `package.json: kept your "${m.stale}" script — its value differs from the framework default, so it is treated as yours`
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
        `package.json: kept your "${name}" script — its value differs from the framework default ("${value}"), so it is treated as yours`
      );
    }
  }

  // Framework-owned dependency: pin to the version this CLI ships.
  const currentDep = pkg.dependencies!['tessera-learn'];
  if (currentDep !== TESSERA_VERSION) {
    pkg.dependencies!['tessera-learn'] = TESSERA_VERSION;
    pkgChanged = true;
    changes.push(
      `package.json: set tessera-learn to "${TESSERA_VERSION}" (was "${currentDep}")`
    );
  }

  if (pkgChanged && !dryRun) {
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }

  // Framework-owned files: straight overwrite.
  const overwrites: { name: string; dest: string; content: string }[] = [
    {
      name: 'AGENTS.md',
      dest: resolve(cwd, 'AGENTS.md'),
      content: readFileSync(resolve(PKG_ROOT, 'AGENTS.md'), 'utf-8'),
    },
    {
      name: 'vite.config.js',
      dest: resolve(cwd, 'vite.config.js'),
      content: VITE_CONFIG,
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
          'vite.config.js: replaced with the framework version — if you had customizations, re-apply them'
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
    `\n${dryRun ? 'Would apply' : 'Applied'} ${changes.length} change(s):\n`
  );
  for (const c of changes) process.stdout.write(`  ${c}\n`);
  if (warnings.length) {
    process.stdout.write(`\nWarnings:\n`);
    for (const w of warnings) process.stdout.write(`  ${w}\n`);
  }
  process.stdout.write(
    dryRun
      ? '\nNo files written (--dry-run). Re-run without --dry-run to apply.\n'
      : '\nDone. Run "npm install" to pick up dependency changes.\n'
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

  if (args.template === 'bare') {
    scaffoldBare(projectDir, name, title);
  } else {
    scaffoldDefault(projectDir, name, title);
  }

  process.stdout.write(
    `\nCreated ${name} (${args.template} template).\n\nNext steps:\n  cd ${name}\n  npm install\n  npm run dev\n`
  );
}

// Only run the CLI when invoked as the entry point. Importing this module
// (e.g. from unit tests) returns the helpers without triggering main().
if (import.meta.main) {
  main();
}
