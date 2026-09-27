import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import {
  BuildContext,
  isInside,
  projectFileRel,
} from '../src/plugin/build-context.js';
import { resolvedConfig } from './helpers/plugin.js';

const root = resolve('/project');

function configureWith(outDir: string, command: 'build' | 'serve' = 'build') {
  new BuildContext().configure(resolvedConfig(root, command, outDir));
}

describe('BuildContext.configure', () => {
  it.each(['.', '..'])('rejects a build outDir of "%s"', (outDir) => {
    expect(() => configureWith(outDir)).toThrow(
      /must not be or contain the project root/,
    );
  });

  it('accepts an outDir inside or beside the project', () => {
    expect(() => configureWith('build')).not.toThrow();
    expect(() => configureWith('../out')).not.toThrow();
  });

  it('ignores outDir outside a build', () => {
    expect(() => configureWith('.', 'serve')).not.toThrow();
  });
});

describe('isInside', () => {
  it('treats a ..-prefixed directory name as inside', () => {
    expect(isInside(root, resolve(root, '..foo', 'page.svelte'))).toBe(true);
    expect(isInside(root, resolve(root, '..', 'page.svelte'))).toBe(false);
  });
});

describe('projectFileRel', () => {
  const page = join('pages', 'welcome.svelte');

  it('returns the project-relative path for an author file', () => {
    expect(projectFileRel('pages/welcome.svelte', root)).toBe(page);
    expect(projectFileRel(resolve(root, page), root)).toBe(page);
    expect(projectFileRel(resolve(root, '..foo', 'x.svelte'), root)).toBe(
      join('..foo', 'x.svelte'),
    );
  });

  it.each([
    ['a missing filename', undefined],
    ['a \\0 virtual id', '\0virtual:tessera-pages'],
    ['a bare virtual id', 'virtual:tessera-main'],
    ['a file outside the project', resolve(root, '..', 'other', 'x.svelte')],
    ['a dependency', resolve(root, 'node_modules', 'lib', 'x.svelte')],
  ])('skips %s', (_label, filename) => {
    expect(projectFileRel(filename, root)).toBeNull();
  });

  it.each([
    ['whose name contains node_modules', 'node_modules-demo'],
    ['named node_modules', 'node_modules'],
    ['whose name contains virtual:', 'virtual:labs'],
  ])('checks a project under a folder %s', (_label, folder) => {
    const nested = resolve('/work', folder, 'course');
    expect(projectFileRel(resolve(nested, page), nested)).toBe(page);
  });
});
