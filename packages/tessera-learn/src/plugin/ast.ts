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

function walkNodes(root: Node, visit: (node: Node) => void): void {
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
    visit(node);
    for (const key of Object.keys(node)) {
      if (key === 'type') continue;
      walk(node[key]);
    }
  };
  walk(root);
}

function collectComponents(root: Node, names: ReadonlySet<string>): Node[] {
  const found: Node[] = [];
  walkNodes(root, (node) => {
    if (node.type === 'Component' && names.has(node.name as string)) {
      found.push(node);
    }
  });
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

/**
 * Paths (e.g. `xapi[0].auth`) of function values inside the `export default`
 * object literal. JSON5 can't parse those, so the validator names them.
 */
export function defaultExportFunctionPaths(jsSource: string): string[] {
  const program = parseJsModule(jsSource);
  if (!program) return [];
  const exported = ((program.body as Node[]) ?? []).find(
    (node) => node.type === 'ExportDefaultDeclaration',
  );
  const paths: string[] = [];
  const visit = (node: Node | null, path: string): void => {
    const value = unwrapTsCast(node);
    if (!value) return;
    if (
      value.type === 'ArrowFunctionExpression' ||
      value.type === 'FunctionExpression'
    ) {
      paths.push(path);
    } else if (value.type === 'ObjectExpression') {
      for (const property of value.properties as Node[]) {
        const key = property.type === 'Property' ? propertyKey(property) : null;
        if (key === null) continue;
        visit(property.value as Node, path ? `${path}.${key}` : key);
      }
    } else if (value.type === 'ArrayExpression') {
      (value.elements as (Node | null)[]).forEach((element, i) =>
        visit(element, `${path}[${i}]`),
      );
    }
  };
  visit((exported?.declaration as Node | undefined) ?? null, '');
  return paths;
}

/** Keys of each `xapi` export entry: `'unknown'` where not statically readable. */
export type RuntimeXAPIHooks = Map<string, ReadonlySet<string> | 'unknown'>;

/**
 * Statically read the `xapi` named export of `course.runtime.js`. `'none'` when
 * it isn't exported; `'unknown'` when its value can't be read from the source.
 */
export function courseRuntimeXAPIHooks(
  jsSource: string,
): RuntimeXAPIHooks | 'none' | 'unknown' | 'parse-error' {
  const program = parseJsModule(jsSource);
  if (!program) return 'parse-error';
  const body = (program.body as Node[]) ?? [];
  const locals = new Map<string, Node | null>();
  for (const node of body) {
    const declaration =
      node.type === 'ExportNamedDeclaration'
        ? (node.declaration as Node | null)
        : node;
    if (declaration?.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declarations as Node[]) {
      const id = decl.id as Node;
      if (id.type === 'Identifier') {
        locals.set(id.name as string, decl.init as Node | null);
      } else {
        for (const name of patternNames(id)) locals.set(name, null);
      }
    }
  }
  for (const name of mutatedNames(program)) {
    if (locals.has(name)) locals.set(name, null);
  }

  let found = false;
  let value: Node | null = null;
  for (const node of body) {
    if (node.type === 'ExportAllDeclaration') return 'unknown';
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration as Node | null;
    if (declaration?.type === 'VariableDeclaration' && locals.has('xapi')) {
      const declares = (declaration.declarations as Node[]).some((decl) =>
        patternNames(decl.id as Node).includes('xapi'),
      );
      if (declares) {
        found = true;
        value = locals.get('xapi') ?? null;
      }
    } else if (
      declaration?.type === 'FunctionDeclaration' &&
      (declaration.id as Node).name === 'xapi'
    ) {
      found = true;
    }
    for (const specifier of (node.specifiers as Node[]) ?? []) {
      const exported = specifier.exported as Node;
      if ((exported.name ?? exported.value) !== 'xapi') continue;
      found = true;
      value = node.source
        ? null
        : (locals.get((specifier.local as Node).name as string) ?? null);
    }
  }
  if (!found) return 'none';

  const entries = staticObjectEntries(value, locals);
  if (entries === 'unknown') return 'unknown';
  const hooks: RuntimeXAPIHooks = new Map();
  for (const [id, entry] of entries) {
    const keys = staticObjectEntries(entry, locals);
    hooks.set(id, keys === 'unknown' ? 'unknown' : new Set(keys.keys()));
  }
  return hooks;
}

export function hasDefaultExport(jsSource: string): boolean {
  const program = parseJsModule(jsSource);
  return ((program?.body as Node[]) ?? []).some(
    (node) =>
      node.type === 'ExportDefaultDeclaration' ||
      (node.type === 'ExportNamedDeclaration' &&
        ((node.specifiers as Node[]) ?? []).some((specifier) => {
          const exported = specifier.exported as Node;
          return (exported.name ?? exported.value) === 'default';
        })),
  );
}

function patternNames(pattern: Node): string[] {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern.name as string];
    case 'ObjectPattern':
      return (pattern.properties as Node[]).flatMap((property) =>
        patternNames(
          property.type === 'Property' ? (property.value as Node) : property,
        ),
      );
    case 'ArrayPattern':
      return (pattern.elements as (Node | null)[]).flatMap((element) =>
        element ? patternNames(element) : [],
      );
    case 'RestElement':
      return patternNames(pattern.argument as Node);
    case 'AssignmentPattern':
      return patternNames(pattern.left as Node);
    default:
      return [];
  }
}

function mutatedNames(program: Node): Set<string> {
  const names = new Set<string>();
  const addRoot = (target: Node | null): void => {
    let node = unwrapTsCast(target);
    while (node?.type === 'MemberExpression') {
      node = unwrapTsCast(node.object as Node);
    }
    if (node?.type === 'Identifier') names.add(node.name as string);
  };
  walkNodes(program, (node) => {
    if (node.type === 'AssignmentExpression') {
      addRoot(node.left as Node);
    } else if (node.type === 'UpdateExpression') {
      addRoot(node.argument as Node);
    } else if (node.type === 'UnaryExpression' && node.operator === 'delete') {
      addRoot(node.argument as Node);
    } else if (
      node.type === 'CallExpression' ||
      node.type === 'NewExpression'
    ) {
      for (const arg of node.arguments as Node[]) addRoot(arg);
    }
  });
  return names;
}

function staticObjectEntries(
  node: Node | null,
  locals: Map<string, Node | null>,
): Map<string, Node> | 'unknown' {
  let value = unwrapTsCast(node);
  if (value?.type === 'Identifier') {
    value = unwrapTsCast(locals.get(value.name as string) ?? null);
  }
  if (value?.type !== 'ObjectExpression') return 'unknown';
  const entries = new Map<string, Node>();
  for (const property of value.properties as Node[]) {
    const key = property.type === 'Property' ? propertyKey(property) : null;
    if (key === null) return 'unknown';
    entries.set(key, property.value as Node);
  }
  return entries;
}

function propertyKey(property: Node): string | null {
  if (property.computed) return null;
  const key = property.key as Node | undefined;
  if (key?.type === 'Identifier') return key.name as string;
  if (key?.type === 'Literal') return String(key.value);
  return null;
}

const MODULE_SCRIPT_OPEN_RE = /<script\s+module[^>]*>/;
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

const LEGACY_MODULE_SCRIPT_RE =
  /<script\s(?:[^>]*\s)?context\s*=\s*["']module["']/;

export function usesLegacyModuleContext(svelteSource: string): boolean {
  const { root } = parseRoot(svelteSource);
  if (!root) return LEGACY_MODULE_SCRIPT_RE.test(svelteSource);
  const attributes =
    (root.module as { attributes?: Node[] } | null)?.attributes ?? [];
  return attributes.some(
    (attr) =>
      attr.type === 'Attribute' &&
      attr.name === 'context' &&
      Array.isArray(attr.value) &&
      (attr.value as { data?: string }[])[0]?.data === 'module',
  );
}

/** 'unknown' when a call's options can't be read statically (spread, variable, computed). */
export function useQuestionGrading(
  source: string,
): 'absent' | 'graded' | 'none' | 'unknown' {
  const { root } = parseRoot(source);
  if (!root) return 'unknown';
  const calls = collectUseQuestionCalls(root);
  if (calls.length === 0) return 'absent';
  let unknown = false;
  for (const call of calls) {
    const state = callGradedState(call);
    if (state === 'graded') return 'graded';
    if (state === 'unknown') unknown = true;
  }
  return unknown ? 'unknown' : 'none';
}

function collectUseQuestionCalls(root: Node): Node[] {
  const calls: Node[] = [];
  const names = new Set<string>();
  walkNodes(root, (node) => {
    if (node.type === 'CallExpression') calls.push(node);
    if (node.type === 'ImportDeclaration') {
      for (const name of useQuestionLocalNames(node)) names.add(name);
    }
  });
  if (names.size === 0) names.add('useQuestion');
  return calls.filter((call) => {
    const callee = call.callee as Node | undefined;
    if (callee?.type === 'Identifier') return names.has(callee.name as string);
    const property = callee?.property as Node | undefined;
    return (
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      property?.name === 'useQuestion'
    );
  });
}

function useQuestionLocalNames(node: Node): string[] {
  const source = node.source as Node | undefined;
  if (source?.value !== 'tessera-learn') return [];
  const specifiers = (node.specifiers as Node[]) ?? [];
  return specifiers
    .filter((specifier) => {
      const imported = specifier.imported as Node | undefined;
      return (
        specifier.type === 'ImportSpecifier' && imported?.name === 'useQuestion'
      );
    })
    .map((specifier) => (specifier.local as Node).name as string);
}

function callGradedState(call: Node): 'graded' | 'none' | 'unknown' {
  const options = unwrapTsCast((call.arguments as Node[])?.[0] ?? null);
  if (!options || options.type !== 'ObjectExpression') return 'unknown';
  let unknown = false;
  for (const property of (options.properties as Node[]) ?? []) {
    if (property.type === 'SpreadElement') {
      unknown = true;
      continue;
    }
    if (property.computed) {
      unknown = true;
      continue;
    }
    if (propertyKey(property) !== 'graded') continue;
    const value = unwrapTsCast(property.value as Node);
    if (value?.type !== 'Literal') return 'unknown';
    if (value.value === true) return 'graded';
    if (value.value !== false) return 'unknown';
  }
  return unknown ? 'unknown' : 'none';
}
