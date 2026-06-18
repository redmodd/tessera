import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join, relative } from 'node:path';
import { resolveCourse } from './course-root.js';
import { validateProjectName } from './project-name.js';

// The top-level `id` property as scaffolders write it: the key (bare or quoted)
// first on its own line, then its value. Anchoring to line start keeps `id:`
// inside a comment or a string value from matching, and CourseConfig has no
// nested `id`, so the first match is always the course identity.
const ID_LINE =
  /^([ \t]*'?id'?[ \t]*:[ \t]*)('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`|[^\n,}]*)/m;
const DEFAULT_OBJECT = /export\s+default\s*\{/;

// A verbatim copy inherits the source's `id`; mint a fresh one so the duplicate
// is a distinct course (own storage key + LRS activity id).
function reidentifyCourse(courseRoot: string): void {
  const configPath = join(courseRoot, 'course.config.js');
  if (!existsSync(configPath)) return;
  const text = readFileSync(configPath, 'utf-8');
  const newId = `'urn:uuid:${randomUUID()}'`;

  if (ID_LINE.test(text)) {
    writeFileSync(configPath, text.replace(ID_LINE, `$1${newId}`));
    return;
  }
  const obj = DEFAULT_OBJECT.exec(text);
  if (obj) {
    const at = obj.index + obj[0].length;
    writeFileSync(
      configPath,
      `${text.slice(0, at)}\n  id: ${newId},${text.slice(at)}`,
    );
    return;
  }
  console.warn(
    `[tessera duplicate] Could not set a unique id in ${configPath} — the copy shares the source's identity. Add a unique "id" manually.`,
  );
}

const HELP =
  'Usage: tessera duplicate <source> <new>\n\n' +
  'Copy courses/<source>/ to courses/<new>/ within the current workspace.';

// Generated/build artifacts that should never travel with a verbatim copy. The
// a11y throwaway build and Vite's cache live under node_modules, so they're
// already pruned by the node_modules skip; the rest are belt-and-suspenders.
const SKIP = new Set(['node_modules', 'dist', 'a11y-report.json', '.vite']);

function skip(srcPath: string): boolean {
  const name = basename(srcPath);
  return SKIP.has(name) || name.startsWith('.tessera');
}

// `tessera duplicate <source> <new>` — copy an existing course verbatim within
// the current workspace. Unlike `new`, there is no template stamping: the JS
// config (including its title) is copied untouched.
export function runDuplicate(
  source: string | undefined,
  target: string | undefined,
  cwd: string,
): number {
  if (
    source === '--help' ||
    source === '-h' ||
    target === '--help' ||
    target === '-h'
  ) {
    console.log(HELP);
    return 0;
  }
  if (!source || !target) {
    console.error('Usage: tessera duplicate <source> <new>');
    return 1;
  }

  const nameError = validateProjectName(target, 'Course name');
  if (nameError) {
    console.error(`[tessera duplicate] ${nameError}`);
    return 1;
  }

  const resolved = resolveCourse(cwd, source);
  if (!resolved.ok) {
    console.error(`[tessera duplicate] ${resolved.error}`);
    return 1;
  }
  const { courseRoot: srcDir, workspaceRoot } = resolved;

  const destDir = join(workspaceRoot, 'courses', target);
  if (existsSync(destDir)) {
    console.error(`[tessera duplicate] Course "${target}" already exists.`);
    return 1;
  }

  cpSync(srcDir, destDir, {
    recursive: true,
    filter: (src) => src === srcDir || !skip(src),
  });
  reidentifyCourse(destDir);

  const rel = relative(workspaceRoot, destDir);
  const srcRel = relative(workspaceRoot, srcDir);
  console.log(
    `\nCreated ${rel} (duplicated from ${srcRel}).\n\n` +
      `Remember to update the title in ${rel}/course.config.js.\n\n` +
      `Next steps:\n  pnpm tessera dev ${target}\n`,
  );
  return 0;
}
