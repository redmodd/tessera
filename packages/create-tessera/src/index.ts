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

Scaffold a new Tessera course.

Options:
  --template=<name>   Template to use ("default" or "bare", default: "default")
  --help, -h          Show this help

Examples:
  npm create tessera@latest my-course
  npm create tessera@latest my-course -- --template=bare
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

function parseArgs(argv: string[]): ParseResult {
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
function validateProjectName(name: string): string | null {
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

function toTitleCase(slug: string): string {
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

function packageJson(name: string): string {
  const pkg = {
    name,
    private: true,
    type: 'module',
    scripts: {
      preview: 'vite dev',
      export: 'vite build',
    },
    dependencies: {
      'tessera-learn': TESSERA_VERSION,
    },
    devDependencies: {
      '@sveltejs/vite-plugin-svelte': '^5.0.0',
      svelte: '^5.0.0',
      vite: '^6.0.0',
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
  This is the first page of your Tessera course. Edit this file to customise the
  welcome content.
</p>

<p>
  See <code>AGENTS.md</code> at the project root for the authoring guide.
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
npm run preview
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

  if (args.template === 'bare') {
    scaffoldBare(projectDir, name, title);
  } else {
    scaffoldDefault(projectDir, name, title);
  }

  process.stdout.write(
    `\nCreated ${name} (${args.template} template).\n\nNext steps:\n  cd ${name}\n  npm install\n  npm run preview\n`
  );
}

main();
