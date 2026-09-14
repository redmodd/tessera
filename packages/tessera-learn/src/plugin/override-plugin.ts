import type { Plugin } from 'vite';
import { normalizePath } from 'vite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { virtualModule } from './virtual-module.js';

export interface OverridePluginOptions {
  name: string;
  virtualId: string;
  projectFile: string;
  /** Built-in re-exported when the project file is absent; null export otherwise. */
  builtinFile?: string;
  /** Default-export the project file's module namespace, for files with named exports. */
  namespace?: boolean;
}

/**
 * A virtual module that resolves to a project-root override file when present,
 * and to the built-in (or a null export) otherwise. Shared by the layout, quiz
 * and course-runtime plugins.
 */
export function createOverridePlugin({
  name,
  virtualId,
  projectFile,
  builtinFile,
  namespace = false,
}: OverridePluginOptions): Plugin {
  const fallback = builtinFile
    ? `export { default } from '${normalizePath(builtinFile)}';`
    : 'export default null;';

  return virtualModule(
    name,
    virtualId,
    function ({ projectRoot }) {
      const filePath = resolve(projectRoot, projectFile);
      if (!existsSync(filePath)) return fallback;
      // Only watch when it exists — addWatchFile on a missing path makes
      // Vite's importAnalysis try to resolve it as a real import.
      this.addWatchFile(filePath);
      const path = normalizePath(filePath);
      return namespace
        ? `import * as mod from '${path}';\nexport default mod;`
        : `export { default } from '${path}';`;
    },
    {
      hooks: (ctx) => ({
        configureServer(server) {
          // Only add/unlink flips load()'s output between the override and the
          // fallback; a `change` leaves it identical and Svelte's own HMR handles
          // the underlying file.
          server.watcher.on('all', (event, changed) => {
            if (event !== 'add' && event !== 'unlink') return;
            if (changed !== resolve(ctx.projectRoot, projectFile)) return;
            ctx.reload(server);
          });
        },
      }),
    },
  );
}
