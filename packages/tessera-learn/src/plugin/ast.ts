import { Parser } from 'acorn';
import { tsPlugin } from '@sveltejs/acorn-typescript';
import { parse } from 'svelte/compiler';

/**
 * Shared parsing layer for the build-time validator and manifest generator.
 *
 * `.svelte` files go through `svelte/compiler`'s `parse`; plain JS files
 * (`course.config.js`, `_meta.js`) and the module-script fallback go through
 * acorn (with `acorn-typescript` for `as const` / `satisfies T`). Static
 * *values* are still recovered with JSON5 by the callers — only structure
 * parsing lives here.
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
  { kind: 'none' } | { kind: 'invalid' } | { kind: 'literal'; text: string };

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
const jsModuleCache = new Map<string, Node | null>();

/** Drop every cached root. Call at the start of a run to scope the cache. */
export function clearParseCache(): void {
  rootCache.clear();
  jsModuleCache.clear();
}

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
    const firstLine = message.split('\n')[0].trim();
    entry = { root: null, error: firstLine || 'parse error' };
  }
  rootCache.set(source, entry);
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
    if (attr.type === 'BindDirective') {
      const expr = (attr as { expression?: Node }).expression;
      if (expr) {
        props.set(attr.name as string, {
          kind: 'expr',
          raw: source.slice(expr.start, expr.end).trim(),
        });
      }
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
      if (source[attr.start] === '{') hasSpread = true;
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

const TsParser = Parser.extend(
  tsPlugin() as unknown as Parameters<typeof Parser.extend>[0],
);

function parseJsModule(source: string): Node | null {
  const cached = jsModuleCache.get(source);
  if (cached !== undefined) return cached;
  let result: Node | null;
  try {
    result = TsParser.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
    }) as unknown as Node;
  } catch {
    result = null;
  }
  jsModuleCache.set(source, result);
  return result;
}

function unwrapTsCast(node: Node | null): Node | null {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSSatisfiesExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'TSNonNullExpression')
  ) {
    current = (current as { expression?: Node }).expression ?? null;
  }
  return current;
}

function findPageConfigInProgram(
  program: Node,
  source: string,
): NamedObjectLiteral {
  const body = (program.body as Node[]) ?? [];
  for (const node of body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration as Node | null;
    if (!declaration || declaration.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declarations as Node[]) {
      const id = decl.id as Node;
      if (id.type !== 'Identifier' || id.name !== 'pageConfig') continue;
      const init = unwrapTsCast(decl.init as Node | null);
      if (init && init.type === 'ObjectExpression') {
        return { kind: 'literal', text: source.slice(init.start, init.end) };
      }
      return { kind: 'invalid' };
    }
  }
  return { kind: 'none' };
}

/**
 * Locate the `export default { ... }` object literal in a plain JS source.
 * Returns a discriminated result so callers can tell parse failure from a
 * missing or non-literal default export.
 */
export function defaultExportObjectLiteral(
  jsSource: string,
): NamedObjectLiteral | { kind: 'parse-error' } {
  const program = parseJsModule(jsSource);
  if (!program) return { kind: 'parse-error' };
  for (const node of (program.body as Node[]) ?? []) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    const decl = unwrapTsCast(
      (node as { declaration?: Node }).declaration ?? null,
    );
    if (decl && decl.type === 'ObjectExpression') {
      return { kind: 'literal', text: jsSource.slice(decl.start, decl.end) };
    }
    return { kind: 'invalid' };
  }
  return { kind: 'none' };
}

const MODULE_SCRIPT_OPEN_RE =
  /<script\s+(?:context\s*=\s*["']module["']|module)[^>]*>/;
const SCRIPT_CLOSE = '</script>';

function pageConfigFromModuleScriptFallback(
  svelteSource: string,
): NamedObjectLiteral {
  const open = svelteSource.match(MODULE_SCRIPT_OPEN_RE);
  if (!open || open.index === undefined) return { kind: 'none' };
  const bodyStart = open.index + open[0].length;
  // Try every `</script>` candidate from earliest; the first one whose body
  // parses as JS is the real close (an earlier hit is inside a string literal).
  let from = bodyStart;
  while (true) {
    const closeIdx = svelteSource.indexOf(SCRIPT_CLOSE, from);
    if (closeIdx < 0) return { kind: 'none' };
    const body = svelteSource.slice(bodyStart, closeIdx);
    const program = parseJsModule(body);
    if (program) return findPageConfigInProgram(program, body);
    from = closeIdx + SCRIPT_CLOSE.length;
  }
}

/**
 * Locate `export const pageConfig = { ... }` in a Svelte page's module script
 * and return the object-literal text. Walks the page-level AST so TypeScript
 * (`lang="ts"`) module scripts are handled by Svelte's own parser.
 */
export function pageConfigLiteral(svelteSource: string): NamedObjectLiteral {
  const { root } = parseRoot(svelteSource);
  if (root) {
    const program = (root.module as { content?: Node } | null)?.content;
    if (!program) return { kind: 'none' };
    return findPageConfigInProgram(program, svelteSource);
  }
  return pageConfigFromModuleScriptFallback(svelteSource);
}
