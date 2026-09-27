import { describe, it, expect, onTestFinished } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { buildInlineConfig } from '../src/plugin/inline-config.js';
import { tempDir } from './helpers.js';

// $shared lives outside the per-course Vite root, so fs.strict (Vite's default)
// blocks it unless buildInlineConfig adds workspaceRoot to fs.allow. The
// workspace is built in os.tmpdir(), outside the repo, on purpose: an ancestor
// pnpm-lock.yaml/.git would let Vite widen fs.allow on its own and mask a regression.

interface FsOptions {
  strict?: boolean;
  allow?: string[];
}

let ws: string;
let courseRoot: string;
let sharedFile: string;

function setupWorkspace(): void {
  ws = tempDir();
  courseRoot = join(ws, 'courses', 'demo');
  mkdirSync(courseRoot, { recursive: true });
  mkdirSync(join(ws, 'shared'), { recursive: true });
  sharedFile = join(ws, 'shared', 'tokens.css');
  writeFileSync(sharedFile, ':root{--x:1}');
}

// A bare dev server (no tesseraPlugin) isolates Vite's fs.strict gate from the
// Svelte transform — the gate is core Vite, enforced before any plugin runs.
async function serveWithFs(fs: FsOptions): Promise<string> {
  const server = await createServer({
    root: courseRoot,
    configFile: false,
    logLevel: 'silent',
    server: { fs, port: 0, host: '127.0.0.1' },
  });
  onTestFinished(() => server.close());
  await server.listen();
  return server.resolvedUrls!.local[0];
}

describe('dev server $shared fs.allow', () => {
  it('serves a workspace file outside the course root via buildInlineConfig', async () => {
    setupWorkspace();
    const cfg = buildInlineConfig(courseRoot, ws);
    const base = await serveWithFs(cfg.server!.fs as FsOptions);
    const res = await fetch(new URL(`/@fs${sharedFile}`, base));
    expect(res.status).toBe(200);
  });

  it('blocks the same file when workspaceRoot is not allowed (negative control)', async () => {
    setupWorkspace();
    const base = await serveWithFs({ strict: true, allow: [courseRoot] });
    const res = await fetch(new URL(`/@fs${sharedFile}`, base));
    expect(res.status).toBe(403);
  });
});
