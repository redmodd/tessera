import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'svelte/compiler';

const PKG_ROOT = resolve(import.meta.dirname, '..');

const stylesheets = [
  ...readdirSync(resolve(PKG_ROOT, 'styles')).map((file) => `styles/${file}`),
  ...readdirSync(resolve(PKG_ROOT, 'src'), {
    recursive: true,
    encoding: 'utf-8',
  })
    .filter((file) => file.endsWith('.svelte'))
    .map((file) => `src/${file}`),
];

function topLevelRules(file: string) {
  const source = readFileSync(resolve(PKG_ROOT, file), 'utf-8');
  const css = parse(
    file.endsWith('.css') ? `<style>${source}</style>` : source,
    { modern: true },
  ).css;
  return css?.children ?? [];
}

// Unlayered author CSS beats every layered rule, so each framework rule must
// sit in the layer for `styles/` to override it.
describe('framework CSS sits in the tessera cascade layer', () => {
  it.each(stylesheets)('%s', (file) => {
    for (const rule of topLevelRules(file)) {
      expect(rule).toMatchObject({
        type: 'Atrule',
        name: 'layer',
        prelude: 'tessera',
      });
    }
  });
});
