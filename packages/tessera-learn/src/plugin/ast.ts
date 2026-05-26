import { parse } from 'svelte/compiler';

/**
 * Shared parsing layer for the build-time validator and manifest generator.
 *
 * Structure is read from Svelte's own AST (`svelte/compiler`'s `parse`, which
 * bundles acorn) so the validator no longer hand-rolls a template scanner.
 * Static *values* are still recovered with JSON5 by the callers — only the
 * parsing of structure (tags, attributes, pageConfig location) moves here.
 *
 * Plain JS files (`course.config.js`, `_meta.js`) are not Svelte, so a
 * string-aware balanced-brace matcher is used to locate the default-export
 * object literal — wrapping them as `<script module>` would mis-tokenise any
 * embedded `</script>` and would not survive trailing TS like `as const`.
 */

export type PropValue =
  | { kind: 'string'; value: string }
  | { kind: 'expr'; raw: string }
  | { kind: 'bool' };

export interface ComponentMatch {
  name: string;
  props: Map<string, PropValue>;
  hasSpread: boolean;
}

export type NamedObjectLiteral =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'literal'; text: string };

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface CacheEntry {
  root: Node | null;
  error: string | null;
}

const rootCache = new Map<string, CacheEntry>();
const ROOT_CACHE_LIMIT = 8;

function parseRoot(source: string): CacheEntry {
  const cached = rootCache.get(source);
  if (cached !== undefined) return cached;
  let entry: CacheEntry;
  try {
    entry = {
      root: parse(source, { modern: true }) as unknown as Node,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    entry = { root: null, error: message.split('\n')[0].trim() };
  }
  rootCache.set(source, entry);
  if (rootCache.size > ROOT_CACHE_LIMIT) {
    const oldest = rootCache.keys().next().value;
    if (oldest !== undefined) rootCache.delete(oldest);
  }
  return entry;
}

function collectComponents(root: Node, names: ReadonlySet<string>): Node[] {
  const found: Node[] = [];
  const seen = new Set<object>();
  const walk = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    const node = value as Node;
    if (node.type === 'Component' && names.has(node.name as string)) {
      found.push(node);
    }
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      walk(node[key]);
    }
  };
  walk(root);
  return found.sort((a, b) => a.start - b.start);
}

function readProps(source: string, node: Node): ComponentMatch {
  const props = new Map<string, PropValue>();
  let hasSpread = false;
  const attributes = (node.attributes as Node[]) ?? [];
  for (const attr of attributes) {
    if (attr.type === 'SpreadAttribute') {
      hasSpread = true;
      continue;
    }
    if (attr.type !== 'Attribute') continue;
    const name = attr.name as string;
    const value = attr.value;
    if (value === true) {
      props.set(name, { kind: 'bool' });
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        props.set(name, { kind: 'string', value: '' });
      } else {
        const first = value[0] as Node;
        const last = value[value.length - 1] as Node;
        props.set(name, {
          kind: 'string',
          value: source.slice(first.start, last.end),
        });
      }
    } else if (
      value &&
      typeof value === 'object' &&
      (value as Node).type === 'ExpressionTag'
    ) {
      const expr = (value as { expression: Node }).expression;
      props.set(name, {
        kind: 'expr',
        raw: source.slice(expr.start, expr.end).trim(),
      });
    }
  }
  return { name: node.name as string, props, hasSpread };
}

/**
 * Return a one-line message if `source` is not valid Svelte, else null. Lets
 * the validator surface a real syntax error itself rather than only failing
 * later in the compiler (and the compile-less CLI would otherwise miss it).
 */
export function getParseError(source: string): string | null {
  return parseRoot(source).error;
}

/**
 * Find every question/media component in a `.svelte` source, anywhere in the
 * markup, with its props. Returns null if the source can't be parsed — callers
 * then skip component validation, matching the old "skip when unsure" stance.
 */
export function findComponents(
  source: string,
  names: ReadonlySet<string>,
): ComponentMatch[] | null {
  const { root } = parseRoot(source);
  if (!root) return null;
  return collectComponents(root, names).map((node) => readProps(source, node));
}

/**
 * Balanced `{...}` / `[...]` span starting at the opening bracket. String-
 * and comment-aware so embedded braces (including `</script>` in a string)
 * don't end the span. Used for plain JS only.
 */
function extractBalancedBraces(
  source: string,
  startIndex: number,
): string | null {
  const open = source[startIndex];
  if (open !== '{' && open !== '[') return null;

  let depth = 0;
  let inString: string | null = null;
  let escaped = false;

  for (let i = startIndex; i < source.length; i++) {
    const char = source[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\' && inString) {
      escaped = true;
      continue;
    }

    if (inString) {
      if (char === inString) inString = null;
      continue;
    }

    if (char === '"' || char === "'" || char === '`') {
      inString = char;
      continue;
    }

    if (char === '/' && i + 1 < source.length && source[i + 1] === '/') {
      const newline = source.indexOf('\n', i);
      i = newline === -1 ? source.length : newline;
      continue;
    }

    if (char === '/' && i + 1 < source.length && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 1;
      continue;
    }

    if (char === '{' || char === '[') depth++;
    if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        return source.slice(startIndex, i + 1);
      }
    }
  }

  return null;
}

/**
 * Return the source text of the object literal in `export default { ... }`,
 * or null if there is no default export or it isn't an object literal.
 * Plain JS only — does not wrap as `<script module>`.
 */
export function defaultExportObjectLiteral(jsSource: string): string | null {
  const match = jsSource.match(/export\s+default\s*/);
  if (!match || match.index === undefined) return null;
  const afterKeyword = match.index + match[0].length;
  const braceIndex = jsSource.indexOf('{', afterKeyword);
  if (braceIndex < 0) return null;
  const between = jsSource.slice(afterKeyword, braceIndex);
  if (between.trim() !== '') return null;
  return extractBalancedBraces(jsSource, braceIndex);
}

function findPageConfigInModule(
  root: Node,
  source: string,
): NamedObjectLiteral {
  const program = (root.module as { content?: Node } | null)?.content;
  if (!program) return { kind: 'none' };
  const body = (program.body as Node[]) ?? [];
  for (const node of body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration as Node | null;
    if (!declaration || declaration.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declarations as Node[]) {
      const id = decl.id as Node;
      if (id.type !== 'Identifier' || id.name !== 'pageConfig') continue;
      const init = decl.init as Node | null;
      if (init && init.type === 'ObjectExpression') {
        return { kind: 'literal', text: source.slice(init.start, init.end) };
      }
      return { kind: 'invalid' };
    }
  }
  return { kind: 'none' };
}

/**
 * Locate `export const pageConfig = { ... }` in a Svelte page's module script
 * and return the object-literal text. Walks the page-level AST so TypeScript
 * (`lang="ts"`) module scripts are handled by Svelte's own parser.
 */
export function pageConfigLiteral(svelteSource: string): NamedObjectLiteral {
  const { root } = parseRoot(svelteSource);
  if (!root) return { kind: 'none' };
  return findPageConfigInModule(root, svelteSource);
}
