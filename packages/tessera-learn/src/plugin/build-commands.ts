import { buildInlineConfig, loadUserConfig } from './inline-config.js';

// vite is imported lazily so the `tessera validate` path never loads it.
async function resolveConfig(projectRoot: string) {
  const vite = await import('vite');
  const base = buildInlineConfig(projectRoot);
  const user = await loadUserConfig(projectRoot);
  return user ? vite.mergeConfig(base, user) : base;
}

export async function runDev(projectRoot: string): Promise<number> {
  const vite = await import('vite');
  const server = await vite.createServer(await resolveConfig(projectRoot));
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
  // Never resolve: the CLI wrapper would process.exit and kill the server.
  return new Promise<number>(() => {});
}

export async function runBuild(projectRoot: string): Promise<number> {
  const vite = await import('vite');
  await vite.build(await resolveConfig(projectRoot));
  return 0;
}
