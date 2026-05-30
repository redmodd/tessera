import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { InlineConfig } from 'vite';
import { tesseraPlugin } from './index.js';

// Base Vite config for every Tessera command (dev, export, a11y build).
// configFile:false disables Vite's own discovery — there is no vite.config.js —
// and tesseraPlugin() supplies the Svelte compiler, so this is the full plugin set.
export function buildInlineConfig(projectRoot: string): InlineConfig {
  return {
    root: projectRoot,
    configFile: false,
    plugins: [tesseraPlugin()],
  };
}

// Optional author-owned escape hatch, never scaffolded or reconciled. A *partial*
// Vite config the caller merges on top of buildInlineConfig(), so tesseraPlugin()
// stays wired in and the author only writes the delta.
export async function loadUserConfig(
  projectRoot: string,
): Promise<InlineConfig | null> {
  const configPath = resolve(projectRoot, 'tessera.config.js');
  if (!existsSync(configPath)) return null;
  const mod = await import(pathToFileURL(configPath).href);
  return (mod.default ?? mod) as InlineConfig;
}
