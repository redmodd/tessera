import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// App.svelte imports the virtual modules the plugin generates in a course
// build. Tests that mount it set globalThis.__tesseraTest first.
const STUBS: Record<string, string> = {
  'virtual:tessera-config': 'export default globalThis.__tesseraTest.config;',
  'virtual:tessera-manifest':
    'export default globalThis.__tesseraTest.manifest;',
  'virtual:tessera-pages':
    'export default globalThis.__tesseraTest.pageModules;',
  'virtual:tessera-adapter':
    'export function createAdapter() { return globalThis.__tesseraTest.adapter; }',
  'virtual:tessera-layout': 'export default null;',
  'virtual:tessera-quiz': 'export default null;',
  'virtual:tessera-xapi-setup':
    'export async function buildXAPIClient() { return null; }',
};

const tesseraVirtualStubs = {
  name: 'tessera-test-virtual-stubs',
  resolveId(id: string) {
    return Object.hasOwn(STUBS, id) ? '\0' + id : null;
  },
  load(id: string) {
    return id.startsWith('\0') ? (STUBS[id.slice(1)] ?? null) : null;
  },
};

export default defineConfig({
  plugins: [
    svelte({ compilerOptions: { css: 'injected' } }),
    tesseraVirtualStubs,
  ],
  resolve: {
    // Tests that mount components (jsdom env) need Svelte's browser build.
    conditions: ['browser'],
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
