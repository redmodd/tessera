import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ConfigEnv, InlineConfig } from 'vite';
import { tesseraPlugin } from './index.js';

// Base Vite config for every Tessera command (dev, export, a11y build).
// configFile:false disables Vite's own discovery — there is no vite.config.js —
// and tesseraPlugin() supplies the Svelte compiler, so this is the full plugin set.
//
// $shared points at the workspace-level design system, which lives outside the
// per-course Vite root, so it is wired here (where workspaceRoot is known) rather
// than next to $assets in the plugin. server.fs.allow must list workspaceRoot or
// the dev server's fs.strict gate refuses to serve $shared files.
export function buildInlineConfig(
  projectRoot: string,
  workspaceRoot: string,
): InlineConfig {
  return {
    root: projectRoot,
    configFile: false,
    plugins: [tesseraPlugin()],
    resolve: { alias: { $shared: resolve(workspaceRoot, 'shared') } },
    server: { fs: { allow: [workspaceRoot] } },
  };
}

// Optional author-owned escape hatch, never scaffolded or reconciled. A *partial*
// Vite config the caller merges on top of buildInlineConfig(), so tesseraPlugin()
// stays wired in and the author only writes the delta.
export async function loadUserConfig(
  projectRoot: string,
  env: ConfigEnv,
): Promise<InlineConfig | null> {
  const configPath = resolve(projectRoot, 'tessera.config.js');
  if (!existsSync(configPath)) return null;
  const mod = await import(pathToFileURL(configPath).href);
  const config = mod.default ?? mod;
  // mergeConfig throws on a function, so resolve Vite's callback form first.
  return (
    typeof config === 'function' ? await config(env) : config
  ) as InlineConfig;
}

export async function resolveTesseraConfig(
  projectRoot: string,
  workspaceRoot: string,
  env: ConfigEnv,
): Promise<InlineConfig> {
  const vite = await import('vite');
  const base = buildInlineConfig(projectRoot, workspaceRoot);
  const user = await loadUserConfig(projectRoot, env);
  return user ? vite.mergeConfig(base, user) : base;
}
