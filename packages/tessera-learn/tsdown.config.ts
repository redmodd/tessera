import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: { 'plugin/index': 'src/plugin/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  fixedExtension: false,
  deps: {
    neverBundle: ['svelte', 'vite', '@sveltejs/vite-plugin-svelte', 'json5'],
  },
});
