import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [
    svelte({ compilerOptions: { css: 'injected' } }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
