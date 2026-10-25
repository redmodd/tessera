import { describe, it, expect } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, parseCss } from 'svelte/compiler';

const PKG_ROOT = resolve(import.meta.dirname, '..');

const stylesheets = globSync(['styles/*.css', 'src/**/*.svelte'], {
  cwd: PKG_ROOT,
});

function topLevelRules(file: string, source: string) {
  return file.endsWith('.css')
    ? parseCss(source).children
    : (parse(source, { modern: true }).css?.children ?? []);
}

// Unlayered author CSS beats every layered rule, so each framework rule must
// sit in the layer for `styles/` to override it. Inside a layer `!important`
// inverts: it beats every author rule, even an author's `!important`.
describe('framework CSS sits in the tessera cascade layer', () => {
  it.each(stylesheets)('%s', (file) => {
    const source = readFileSync(resolve(PKG_ROOT, file), 'utf-8');
    for (const rule of topLevelRules(file, source)) {
      expect(rule).toMatchObject({
        type: 'Atrule',
        name: 'layer',
        prelude: 'tessera',
      });
    }
    expect(source).not.toContain('!important');
  });
});
