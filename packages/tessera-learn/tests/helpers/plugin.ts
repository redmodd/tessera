import type { Plugin, ResolvedConfig } from 'vite';
import { tesseraPlugin } from '../../src/plugin/index.js';
import { BuildContext } from '../../src/plugin/build-context.js';

function resolvedConfig(root: string, command: string): ResolvedConfig {
  return { root, command, build: { outDir: 'dist' } } as ResolvedConfig;
}

export function resolvedContext(root: string, command = 'serve'): BuildContext {
  const ctx = new BuildContext();
  ctx.resolve(resolvedConfig(root, command));
  return ctx;
}

/** `tesseraPlugin()` with its shared context resolved; returns a by-name lookup. */
export function resolvedPlugins(
  root: string,
  command = 'serve',
): (name: string) => Plugin {
  const plugins = tesseraPlugin() as Plugin[];
  const get = (name: string) => {
    const plugin = plugins.find((p) => p.name === name);
    if (!plugin) throw new Error(`plugin ${name} not found`);
    return plugin;
  };
  const context = get('tessera:context');
  (context.configResolved as any).call(context, resolvedConfig(root, command));
  return get;
}
