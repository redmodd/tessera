import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { normalizePath } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export interface OverridePluginOptions {
  name: string;
  virtualId: string;
  projectFile: string;
  /** Built-in re-exported when the project file is absent; null export otherwise. */
  builtinFile?: string;
}

/**
 * A virtual module that resolves to a project-root override file when present,
 * and to the built-in (or a null export) otherwise. Shared by the layout and
 * quiz plugins — they differ only in the virtual id, file name, and built-in.
 */
export function createOverridePlugin({
  name,
  virtualId,
  projectFile,
  builtinFile,
}: OverridePluginOptions): Plugin {
  const resolvedId = '\0' + virtualId;
  const fallback = builtinFile
    ? `export { default } from '${normalizePath(builtinFile)}';`
    : 'export default null;';
  let filePath: string;

  return {
    name,
    enforce: 'pre',

    configResolved(config: ResolvedConfig) {
      filePath = resolve(config.root, projectFile);
    },

    resolveId(id) {
      if (id === virtualId) return resolvedId;
      return null;
    },

    load(id) {
      if (id !== resolvedId) return null;
      if (existsSync(filePath)) {
        // Only watch when it exists — addWatchFile on a missing path makes
        // Vite's importAnalysis try to resolve it as a real import.
        this.addWatchFile(filePath);
        return `export { default } from '${normalizePath(filePath)}';`;
      }
      return fallback;
    },

    configureServer(server: ViteDevServer) {
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
