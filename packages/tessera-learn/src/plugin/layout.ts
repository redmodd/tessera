import type { Plugin } from 'vite';
import { createOverridePlugin } from './override-plugin.js';

export function tesseraLayoutPlugin(): Plugin {
  return createOverridePlugin({
    name: 'tessera:layout',
    virtualId: 'virtual:tessera-layout',
    projectFile: 'layout.svelte',
  });
}
