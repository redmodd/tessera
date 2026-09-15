import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { BuildContext, isInside } from '../src/plugin/build-context.js';

const root = resolve('/project');

function resolveWith(outDir: string, command = 'build') {
  new BuildContext().resolve({
    root,
    command,
    build: { outDir },
  } as ResolvedConfig);
}

describe('BuildContext.resolve', () => {
  it.each(['.', '..'])('rejects a build outDir of "%s"', (outDir) => {
    expect(() => resolveWith(outDir)).toThrow(
      /must not be or contain the project root/,
    );
  });

  it('accepts an outDir inside or beside the project', () => {
    expect(() => resolveWith('build')).not.toThrow();
    expect(() => resolveWith('../out')).not.toThrow();
  });

  it('ignores outDir outside a build', () => {
    expect(() => resolveWith('.', 'serve')).not.toThrow();
  });
});

describe('isInside', () => {
  it('treats a ..-prefixed directory name as inside', () => {
    expect(isInside(root, resolve(root, '..foo', 'page.svelte'))).toBe(true);
    expect(isInside(root, resolve(root, '..', 'page.svelte'))).toBe(false);
  });
});
