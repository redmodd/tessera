import type { Plugin, ResolvedConfig, Rollup, ViteDevServer } from 'vite';
import { resolve } from 'node:path';

export interface VirtualModuleContext {
  readonly projectRoot: string;
  readonly isBuild: boolean;
  readonly outDir: string;
  reload(server: ViteDevServer): void;
}

export interface VirtualModuleOptions {
  /** Extra incoming ids that resolve to the same module. */
  aliases?: string[];
  hooks?: (
    ctx: VirtualModuleContext,
  ) => Pick<Plugin, 'buildStart' | 'closeBundle' | 'configureServer'>;
}

export function virtualModule(
  name: string,
  virtualId: string,
  load: (
    this: Rollup.PluginContext,
    ctx: VirtualModuleContext,
  ) => string | null,
  { aliases = [], hooks }: VirtualModuleOptions = {},
): Plugin {
  const resolvedId = '\0' + virtualId;
  const ids = new Set([virtualId, ...aliases]);
  let config: ResolvedConfig;
  const ctx: VirtualModuleContext = {
    get projectRoot() {
      return config.root;
    },
    get isBuild() {
      return config.command === 'build';
    },
    get outDir() {
      return resolve(config.root, config.build.outDir);
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
      return ids.has(id) ? resolvedId : null;
    },
    load(id) {
      return id === resolvedId ? load.call(this, ctx) : null;
    },
  };
}
