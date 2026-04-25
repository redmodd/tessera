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
      // Register the file with Vite so additions/removals invalidate the
      // virtual module in build --watch mode and the dev watcher fires.
      this.addWatchFile(layoutPath);
      if (existsSync(layoutPath)) {
        const normalized = layoutPath.replace(/\\/g, '/');
        return `export { default } from '${normalized}';`;
      }
      return `export default null;`;
    },

    configureServer(server: ViteDevServer) {
      const layoutPath = resolve(projectRoot, 'layout.svelte');
      server.watcher.on('all', (_event, filePath) => {
        if (filePath !== layoutPath) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_LAYOUT_ID);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
        }
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
