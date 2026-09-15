import type { Plugin, Rollup } from 'vite';
import { relative } from 'node:path';

interface VirtualModuleContext {
  projectRoot: string;
  isBuild: boolean;
}

export function virtualModule(
  name: string,
  virtualId: string,
  load: (this: Rollup.PluginContext, ctx: VirtualModuleContext) => string,
  shouldReload?: (
    event: string,
    file: string,
    ctx: VirtualModuleContext,
  ) => boolean,
): Plugin {
  const resolvedId = '\0' + virtualId;
  const ctx: VirtualModuleContext = { projectRoot: '', isBuild: false };
  return {
    name,
    enforce: 'pre',
    configResolved(config) {
      ctx.projectRoot = config.root;
      ctx.isBuild = config.command === 'build';
    },
    resolveId: {
      filter: { id: new RegExp(`^/?${virtualId}$`) },
      handler: () => resolvedId,
    },
    load: {
      filter: { id: new RegExp(`^${resolvedId}$`) },
      handler() {
        return load.call(this, ctx);
      },
    },
    configureServer(server) {
      if (!shouldReload) return;
      const client = server.environments.client;
      server.watcher.on('all', (event, file) => {
        if (!shouldReload(event, file, ctx)) return;
        console.log(
          `[${name}] Reloading (${event}: ${relative(ctx.projectRoot, file)})`,
        );
        const mod = client.moduleGraph.getModuleById(resolvedId);
        if (mod) client.moduleGraph.invalidateModule(mod);
        client.hot.send({ type: 'full-reload' });
      });
    },
  };
}
