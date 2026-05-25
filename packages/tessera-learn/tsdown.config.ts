import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'plugin/index': 'src/plugin/index.ts',
    'plugin/cli': 'src/plugin/cli.ts',
    'plugin/a11y-cli': 'src/plugin/a11y-cli.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {
    neverBundle: [
      'svelte',
      'vite',
      '@sveltejs/vite-plugin-svelte',
      'json5',
      'playwright',
      '@playwright/test',
      '@axe-core/playwright',
    ],
  },
});
