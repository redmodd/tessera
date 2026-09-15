import type { Plugin, ResolvedConfig, Rollup } from 'vite';

export interface VirtualModuleContext {
  readonly projectRoot: string;
  readonly isBuild: boolean;
}

export type ShouldReload = (
  event: string,
  file: string,
  ctx: VirtualModuleContext,
) => boolean;

export function virtualModule(
  name: string,
  virtualId: string,
  load: (this: Rollup.PluginContext, ctx: VirtualModuleContext) => string,
  shouldReload?: ShouldReload,
): Plugin {
  const resolvedId = '\0' + virtualId;
  let config: ResolvedConfig;
  const ctx: VirtualModuleContext = {
    get projectRoot() {
      return config.root;
    },
    get isBuild() {
      return config.command === 'build';
    },
  };
  return {
    name,
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
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
        const mod = client.moduleGraph.getModuleById(resolvedId);
        if (mod) client.moduleGraph.invalidateModule(mod);
        client.hot.send({ type: 'full-reload' });
      });
    },
  };
}
