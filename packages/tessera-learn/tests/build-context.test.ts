import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { BuildContext, isInside } from '../src/plugin/build-context.js';
import { resolvedConfig } from './helpers/plugin.js';

const root = resolve('/project');

function configureWith(outDir: string, command = 'build') {
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
