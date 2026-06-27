import { resolveTesseraConfig } from './inline-config.js';

export async function runDev(
  projectRoot: string,
  workspaceRoot: string,
): Promise<number> {
  const vite = await import('vite');
  const config = await resolveTesseraConfig(projectRoot, workspaceRoot, {
    command: 'serve',
    mode: 'development',
  });
  const server = await vite.createServer(config);
  await server.listen();
  server.printUrls();
  server.bindCLIShortcuts({ print: true });
  // Never resolve: the CLI wrapper would process.exit and kill the server.
  return new Promise<number>(() => {});
}

export async function runBuild(
  projectRoot: string,
  workspaceRoot: string,
  standardOverride?: string,
): Promise<number> {
  const vite = await import('vite');
  const config = await resolveTesseraConfig(
    projectRoot,
    workspaceRoot,
    { command: 'build', mode: 'production' },
    standardOverride,
  );
  await vite.build(config);
  return 0;
}
