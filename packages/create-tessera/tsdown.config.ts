import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'tsdown';

const here = dirname(fileURLToPath(import.meta.url));

const frameworkPkg = JSON.parse(
  readFileSync(resolve(here, '../tessera-learn/package.json'), 'utf-8'),
) as { peerDependencies?: { svelte?: string } };

const sveltePin = frameworkPkg.peerDependencies?.svelte;
if (typeof sveltePin !== 'string' || sveltePin.length === 0) {
  throw new Error(
    "Could not derive the Svelte pin from tessera-learn's peerDependencies.svelte.",
  );
}

const rootPkg = JSON.parse(
  readFileSync(resolve(here, '../../package.json'), 'utf-8'),
) as { packageManager?: string };

const packageManager = rootPkg.packageManager;
if (typeof packageManager !== 'string' || packageManager.length === 0) {
  throw new Error(
    'Could not derive the pnpm pin from the root package.json packageManager field.',
  );
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  banner: '#!/usr/bin/env node',
  define: {
    __SVELTE_VERSION__: JSON.stringify(sveltePin),
    __PACKAGE_MANAGER__: JSON.stringify(packageManager),
  },
});
