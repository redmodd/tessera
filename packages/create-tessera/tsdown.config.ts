import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'tsdown';

const frameworkPkg = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../tessera-learn/package.json',
    ),
    'utf-8',
  ),
) as { dependencies: { svelte: string } };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  banner: '#!/usr/bin/env node',
  define: {
    __SVELTE_VERSION__: JSON.stringify(frameworkPkg.dependencies.svelte),
  },
});
