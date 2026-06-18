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

function isComment(text: string, i: number): boolean {
  return text[i] === '/' && (text[i + 1] === '/' || text[i + 1] === '*');
}

// Skip a `//` line or `/* */` block comment starting at i (a comment per
// isComment). Returns the index just past it.
function skipComment(text: string, i: number): number {
  if (text[i + 1] === '/') {
    i += 2;
    while (i < text.length && text[i] !== '\n') i++;
    return i;
  }
  i += 2;
  while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
  return Math.min(i + 2, text.length);
}

// Index of the `{` opening the default-exported config object, across the
// forms `export default { … }`, `export default ({ … })`,
// `export default wrap({ … })`, and `export default name;` with a
// `const/let/var name = { … }` declaration.
function configObjectBrace(text: string): number | null {
  const decl = /export\s+default\s*/.exec(text);
  if (!decl) return null;
  let i = decl.index + decl[0].length;
  const skipWs = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  skipWs();
  while (text[i] === '(') {
    i++;
    skipWs();
  }
  if (text[i] === '{') return i;
  const ident = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
  if (!ident) return null;
  i += ident[0].length;
  skipWs();
  if (text[i] === '(') {
    i++;
    skipWs();
    return text[i] === '{' ? i : null;
  }
  const named = new RegExp(`(?:const|let|var)\\s+${ident[0]}\\s*=\\s*\\{`).exec(
    text,
  );
  return named ? text.indexOf('{', named.index) : null;
}

// Span of the value following a `:` at `afterColon`, trimmed of surrounding
// whitespace. A quoted value is taken whole; otherwise it runs to the next
// `,`, `}`, newline, or comment.
function valueSpanFrom(text: string, afterColon: number): [number, number] {
  let v = afterColon;
  while (v < text.length && /\s/.test(text[v])) v++;
  let end =
    text[v] === '"' || text[v] === "'" || text[v] === '`'
      ? skipString(text, v)
      : v;
  while (
    end < text.length &&
    text[end] !== ',' &&
    text[end] !== '}' &&
    text[end] !== '\n' &&
    !isComment(text, end)
  )
    end++;
  while (end > v && /\s/.test(text[end - 1])) end--;
  return [v, end];
}

// Locate the value span of the *top-level* `id` property in the config object.
// Depth-aware and quote/comment-agnostic so a nested `id:` key — or one written
// inside a comment — is never the one we touch; bare and quoted `id` keys and
// ' " ` string values are all handled. Returns null if there's no top-level id
// (caller then inserts one).
function topLevelIdValueSpan(text: string): [number, number] | null {
  const brace = configObjectBrace(text);
  if (brace === null) return null;
  let i = brace + 1;
  let depth = 1;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (isComment(text, i)) {
      i = skipComment(text, i);
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const after = skipString(text, i);
      if (depth === 1) {
        let c = after;
        while (c < text.length && /\s/.test(text[c])) c++;
        if (text[c] === ':' && text.slice(i + 1, after - 1) === 'id') {
          return valueSpanFrom(text, c + 1);
        }
      }
      i = after;
      continue;
    }
    if (ch === '{' || ch === '[' || ch === '(') {
      depth++;
    } else if (ch === '}' || ch === ']' || ch === ')') {
      depth--;
    } else if (depth === 1 && /[A-Za-z_$]/.test(ch)) {
      const key = /^([A-Za-z_$][\w$]*)\s*:/.exec(text.slice(i));
      if (key) {
        if (key[1] === 'id') return valueSpanFrom(text, i + key[0].length);
        i += key[0].length;
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
  if (span) {
    writeFileSync(
      configPath,
      text.slice(0, span[0]) + newId + text.slice(span[1]),
    );
    return;
  }
  const brace = configObjectBrace(text);
  if (brace === null) {
    console.warn(
      `[tessera duplicate] Could not set a unique id in ${configPath} — the copy shares the source's identity. Add a unique "id" manually.`,
    );
    return;
  }
  writeFileSync(
    configPath,
    `${text.slice(0, brace + 1)}\n  id: ${newId},${text.slice(brace + 1)}`,
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
