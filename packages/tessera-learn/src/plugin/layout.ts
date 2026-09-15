import type { Plugin } from 'vite';
import { createOverridePlugin } from './override-plugin.js';
import type { BuildContext } from './build-context.js';

export function tesseraLayoutPlugin(ctx: BuildContext): Plugin {
  return createOverridePlugin(ctx, {
    name: 'tessera:layout',
    virtualId: 'virtual:tessera-layout',
    projectFile: 'layout.svelte',
  });
}
