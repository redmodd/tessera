import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const VIRTUAL_LAYOUT_ID = 'virtual:tessera-layout';
const RESOLVED_LAYOUT_ID = '\0' + VIRTUAL_LAYOUT_ID;

export function tesseraLayoutPlugin(): Plugin {
  let projectRoot: string;

  return {
    name: 'tessera:layout',
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === VIRTUAL_LAYOUT_ID) return RESOLVED_LAYOUT_ID;
      return null;
    },

    load(id) {
      if (id !== RESOLVED_LAYOUT_ID) return null;
      const layoutPath = resolve(projectRoot, 'layout.svelte');
      if (existsSync(layoutPath)) {
        // Register the file with Vite so edits trigger HMR / build --watch
        // re-runs. Only add when the file actually exists — calling
        // addWatchFile on a non-existent path makes Vite's importAnalysis
        // try to resolve it as a real import.
        this.addWatchFile(layoutPath);
        const normalized = layoutPath.replace(/\\/g, '/');
        return `export { default } from '${normalized}';`;
      }
      return `export default null;`;
    },

    configureServer(server: ViteDevServer) {
      const layoutPath = resolve(projectRoot, 'layout.svelte');
      // Only react to add/unlink: those flip the virtual module's load() output
      // between `export default null` and `export { default } from '...'`. A
      // `change` event leaves that output identical and is handled by Svelte's
      // own HMR for the underlying file — full-reloading on every edit would
      // wipe in-page state for no reason.
      server.watcher.on('all', (event, filePath) => {
        if (filePath !== layoutPath) return;
        if (event !== 'add' && event !== 'unlink') return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_LAYOUT_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
