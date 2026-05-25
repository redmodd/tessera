import { parse } from 'svelte/compiler';

/**
 * Shared parsing layer for the build-time validator and manifest generator.
 *
 * Structure is read from Svelte's own AST (`svelte/compiler`'s `parse`, which
 * bundles acorn) so the validator no longer hand-rolls a template scanner or a
 * balanced-brace matcher. Static *values* are still recovered with JSON5 by the
 * callers — only the parsing of structure (tags, attributes, object-literal
 * spans) moves here, since that is where the regex path's false negatives lived.
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

interface Node {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

const rootCache = new Map<string, Node | null>();

/** Parse a source string, returning the AST root or null on a syntax error. */
function parseRoot(source: string): Node | null {
  const cached = rootCache.get(source);
  if (cached !== undefined) return cached;
  let root: Node | null;
  try {
    root = parse(source, { modern: true }) as unknown as Node;
  } catch {
    root = null;
  }
  rootCache.set(source, root);
  return root;
}

/** Depth-first collect of component nodes whose name is in `names`, in source order. */
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

/** Build the prop map for one element, mirroring the old PropValue shape. */
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
 * Return a one-line message if `source` is not valid Svelte, else null. Lets the
 * validator surface a real syntax error itself rather than only failing later in
 * the compiler (and the compile-less CLI would otherwise miss it entirely).
 */
export function getParseError(source: string): string | null {
  if (parseRoot(source) !== null) return null;
  try {
    parse(source, { modern: true });
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.split('\n')[0].trim();
  }
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
  const root = parseRoot(source);
  if (!root) return null;
  return collectComponents(root, names).map((node) => readProps(source, node));
}

/** Parse a JS source by wrapping it as a module script, returning its Program body. */
function parseModuleBody(
  jsSource: string,
): { body: Node[]; wrapped: string } | null {
  const wrapped = `<script module>\n${jsSource}\n</script>`;
  const root = parseRoot(wrapped);
  const program = root && (root.module as { content?: Node } | null)?.content;
  if (!program) return null;
  return { body: (program.body as Node[]) ?? [], wrapped };
}

/**
 * Return the source text of the object literal in `export default { ... }`,
 * or null if there is no default export, it isn't an object literal, or the
 * source can't be parsed. Replaces the hand-rolled balanced-brace matcher.
 */
export function defaultExportObjectLiteral(jsSource: string): string | null {
  const parsed = parseModuleBody(jsSource);
  if (!parsed) return null;
  for (const node of parsed.body) {
    if (node.type !== 'ExportDefaultDeclaration') continue;
    const decl = node.declaration as Node;
    if (decl.type !== 'ObjectExpression') return null;
    return parsed.wrapped.slice(decl.start, decl.end);
  }
  return null;
}

export type NamedObjectLiteral =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'literal'; text: string };

/**
 * Locate `export const <name> = { ... }` and return the object-literal text.
 * `none` when the export is absent, `invalid` when present but not a static
 * object literal (or unparseable), `literal` with the text otherwise.
 */
export function namedExportObjectLiteral(
  jsSource: string,
  name: string,
): NamedObjectLiteral {
  const parsed = parseModuleBody(jsSource);
  if (!parsed) {
    return new RegExp(`export\\s+const\\s+${name}\\b`).test(jsSource)
      ? { kind: 'invalid' }
      : { kind: 'none' };
  }
  for (const node of parsed.body) {
    if (node.type !== 'ExportNamedDeclaration') continue;
    const declaration = node.declaration as Node | null;
    if (!declaration || declaration.type !== 'VariableDeclaration') continue;
    for (const decl of declaration.declarations as Node[]) {
      const id = decl.id as Node;
      if (id.type !== 'Identifier' || id.name !== name) continue;
      const init = decl.init as Node | null;
      if (init && init.type === 'ObjectExpression') {
        return {
          kind: 'literal',
          text: parsed.wrapped.slice(init.start, init.end),
        };
      }
      return { kind: 'invalid' };
    }
  }
  return { kind: 'none' };
}
