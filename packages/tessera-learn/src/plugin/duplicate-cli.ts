import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, join, relative } from 'node:path';
import { resolveCourse } from './course-root.js';
import { validateProjectName } from './project-name.js';

function skipString(text: string, i: number): number {
  const quote = text[i++];
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quote) return i + 1;
    i++;
  }
  return i;
}

// Locate the value span of the *top-level* `id` property in an `export default
// { … }` config. Depth-aware and quote-agnostic so a nested `id:` key is never
// the one we touch and ' " ` are all handled; returns null if there's no
// top-level id (caller then inserts one).
function topLevelIdValueSpan(text: string): [number, number] | null {
  const decl = /export\s+default\s*\{/.exec(text);
  if (!decl) return null;
  let i = text.indexOf('{', decl.index) + 1;
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      i = skipString(text, i);
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
    } else if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
      const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(text.slice(i));
      if (key) {
        let v = i + key[0].length;
        while (v < text.length && /\s/.test(text[v])) v++;
        if (key[1] === 'id') {
          let end =
            text[v] === '"' || text[v] === "'" || text[v] === '`'
              ? skipString(text, v)
              : v;
          while (
            end < text.length &&
            text[end] !== ',' &&
            text[end] !== '}' &&
            text[end] !== '\n'
          )
            end++;
          while (end > v && /\s/.test(text[end - 1])) end--;
          return [v, end];
        }
        i = v;
        continue;
      }
    }
    i++;
  }
  return null;
}

// A verbatim copy inherits the source's `id`; mint a fresh one so the duplicate
// is a distinct course (own storage key + LRS activity id).
function reidentifyCourse(courseRoot: string): void {
  const configPath = join(courseRoot, 'course.config.js');
  if (!existsSync(configPath)) return;
  const text = readFileSync(configPath, 'utf-8');
  const newId = `'urn:uuid:${randomUUID()}'`;
  const span = topLevelIdValueSpan(text);
  const updated = span
    ? text.slice(0, span[0]) + newId + text.slice(span[1])
    : text.replace(
        /export\s+default\s*\{/,
        (m) => `${m}\n  id: ${newId},`,
      );
  writeFileSync(configPath, updated);
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
