import type { Plugin, ResolvedConfig, Rollup, ViteDevServer } from 'vite';

export interface VirtualModuleContext {
  readonly projectRoot: string;
  readonly isBuild: boolean;
  reload(server: ViteDevServer): void;
}

export interface VirtualModuleOptions {
  hooks?: (
    ctx: VirtualModuleContext,
  ) => Pick<Plugin, 'buildStart' | 'configureServer'>;
}

export function virtualModule(
  name: string,
  virtualId: string,
  load: (this: Rollup.PluginContext, ctx: VirtualModuleContext) => string,
  { hooks }: VirtualModuleOptions = {},
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
    reload(server) {
      const mod = server.moduleGraph.getModuleById(resolvedId);
      if (mod) server.moduleGraph.invalidateModule(mod);
      server.ws.send({ type: 'full-reload' });
    },
  };
  return {
    ...hooks?.(ctx),
    name,
    enforce: 'pre',
    configResolved(resolved) {
      config = resolved;
    },
    resolveId(id) {
      return id === virtualId || id === '/' + virtualId ? resolvedId : null;
    },
    load(id) {
      return id === resolvedId ? load.call(this, ctx) : null;
    },
  };
}
