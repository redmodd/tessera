import type { HotUpdateOptions, Plugin, Rollup } from 'vite';
import { relative } from 'node:path';

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
    const { moduleGraph, hot, logger, config } = this.environment;
    logger.info(
      `[${name}] Reloading (${type}: ${relative(config.root, file)})`,
      { timestamp: true },
    );
    const mod = moduleGraph.getModuleById(resolvedId);
    if (mod) moduleGraph.invalidateModule(mod);
    hot.send({ type: 'full-reload' });
    return [];
  };
  return plugin;
}
