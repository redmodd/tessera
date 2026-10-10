import type { DevEnvironment, HotUpdateOptions, Plugin, Rollup } from 'vite';
import { relative } from 'node:path';

export function reloadVirtualModule(
  environment: DevEnvironment,
  name: string,
  virtualId: string,
  cause: string,
): void {
  const { moduleGraph, hot, logger } = environment;
  logger.info(`[${name}] Reloading (${cause})`, { timestamp: true });
  const mod = moduleGraph.getModuleById('\0' + virtualId);
  if (mod) moduleGraph.invalidateModule(mod);
  hot.send({ type: 'full-reload' });
}

export function virtualModule(
  name: string,
  virtualId: string,
  load: (this: Rollup.PluginContext) => string,
  shouldReload?: (type: HotUpdateOptions['type'], file: string) => boolean,
): Plugin {
  const resolvedId = '\0' + virtualId;
  const plugin: Plugin = {
    name,
    enforce: 'pre',
    resolveId: {
      filter: { id: new RegExp(`^/?${virtualId}$`) },
      handler: () => resolvedId,
    },
    load: {
      filter: { id: new RegExp(`^${resolvedId}$`) },
      handler: load,
    },
  };
  if (!shouldReload) return plugin;

  plugin.hotUpdate = function ({ type, file }) {
    if (this.environment.name !== 'client') return;
    if (!shouldReload(type, file)) return;
    reloadVirtualModule(
      this.environment,
      name,
      virtualId,
      `${type}: ${relative(this.environment.config.root, file)}`,
    );
    return [];
  };
  return plugin;
}
