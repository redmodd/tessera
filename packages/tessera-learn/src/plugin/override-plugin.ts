import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OverridePluginOptions {
  /** Vite plugin name, e.g. 'tessera:layout'. */
  name: string;
  /** Virtual module id authors/runtime import, e.g. 'virtual:tessera-layout'. */
  virtualId: string;
  /** Project-root file that overrides the built-in, e.g. 'layout.svelte'. */
  projectFile: string;
  /** Module source emitted when the project file is absent. */
  fallback: string;
}

/**
 * A virtual module that resolves to a project-root override file when present,
 * and to `fallback` otherwise. Shared by the layout and quiz plugins — they
 * differ only in the virtual id, the file name, and the fallback module.
 */
export function createOverridePlugin({
  name,
  virtualId,
  projectFile,
  fallback,
}: OverridePluginOptions): Plugin {
  const resolvedId = '\0' + virtualId;
  let projectRoot: string;

  return {
    name,
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      projectRoot = config.root;
    },

    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },

    load(id) {
      if (id !== resolvedId) return null;
      const filePath = resolve(projectRoot, projectFile);
      if (existsSync(filePath)) {
        // Only watch when it exists — addWatchFile on a missing path makes
        // Vite's importAnalysis try to resolve it as a real import.
        this.addWatchFile(filePath);
        return `export { default } from '${filePath.replace(/\\/g, '/')}';`;
      }
      return fallback;
    },

    configureServer(server: ViteDevServer) {
      const filePath = resolve(projectRoot, projectFile);
      // Only add/unlink flips load()'s output between the override and the
      // fallback; a `change` leaves it identical and Svelte's own HMR handles
      // the underlying file.
      server.watcher.on('all', (event, changed) => {
        if (changed !== filePath) return;
        if (event !== 'add' && event !== 'unlink') return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
