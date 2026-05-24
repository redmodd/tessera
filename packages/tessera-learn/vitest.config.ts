import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ compilerOptions: { css: 'injected' } })],
  resolve: {
    // Tests that mount components (jsdom env) need Svelte's browser build.
    conditions: ['browser'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
