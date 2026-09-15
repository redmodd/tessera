import type { HotUpdateOptions, Plugin, Rollup } from 'vite';
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
    type: HotUpdateOptions['type'],
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
    hotUpdate({ type, file }) {
      if (this.environment.name !== 'client') return;
      if (!shouldReload?.(type, file, ctx)) return;
      const { moduleGraph, hot, logger } = this.environment;
      logger.info(
        `[${name}] Reloading (${type}: ${relative(ctx.projectRoot, file)})`,
        { timestamp: true },
      );
      const mod = moduleGraph.getModuleById(resolvedId);
      if (mod) moduleGraph.invalidateModule(mod);
      hot.send({ type: 'full-reload' });
    },
  };
}
