import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer, type ViteDevServer } from 'vite';
import { buildInlineConfig } from '../src/plugin/inline-config.js';

// Guards the $shared dev-serve gotcha: shared/ lives outside the per-course Vite
// root, and with server.fs.strict (Vite's default) the dev server refuses files
// outside its allow-list. buildInlineConfig must add workspaceRoot to fs.allow.
//
// The workspace is built in os.tmpdir(), OUTSIDE the repo, on purpose: an
// ancestor pnpm-lock.yaml/.git would let Vite widen fs.allow by itself and mask
// a regression. Here the gate is governed solely by what buildInlineConfig sets.

interface FsOptions {
  strict?: boolean;
  allow?: string[];
}

let ws: string;
let courseRoot: string;
let sharedFile: string;
let servers: ViteDevServer[] = [];

function setupWorkspace(): void {
  ws = resolve(
    tmpdir(),
    `tessera-fs-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
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
  servers.push(server);
  await server.listen();
  return server.resolvedUrls!.local[0];
}

afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
  servers = [];
  rmSync(ws, { recursive: true, force: true });
});

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
