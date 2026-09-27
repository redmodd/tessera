import { describe, it, expect, onTestFinished } from 'vitest';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { buildInlineConfig } from '../src/plugin/inline-config.js';
import { tempDir } from './helpers.js';

// Unlike dev-server-fs.test.ts (hand-rolled config), this boots the real
// buildInlineConfig and serves a $shared asset from outside the course root.
// tmpdir is deliberate: an ancestor pnpm-lock.yaml/.git would let Vite widen
// fs.allow on its own and mask a regression. Svelte render is left to e2e.

let ws: string;
let courseRoot: string;
let sharedCss: string;

function write(path: string, content: string): void {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function setupWorkspace(): void {
  // Vite canonicalizes its root, so fs.allow (workspaceRoot) must be canonical
  // too, otherwise /tmp vs /private/tmp on macOS trips the fs gate.
  ws = realpathSync(tempDir());
  courseRoot = join(ws, 'courses', 'demo');
  mkdirSync(courseRoot, { recursive: true });

  sharedCss = join(ws, 'shared', 'tokens.css');
  write(sharedCss, ':root{--shared-x:1}');

  // tesseraPlugin validates the course at config time, so the tree must be valid
  // for the dev server to start.
  write(
    join(courseRoot, 'course.config.js'),
    `export default {\n  title: 'Demo',\n  language: 'en',\n  navigation: { mode: 'free' },\n  completion: { mode: 'percentage', percentageThreshold: 100 },\n  scoring: { passingScore: 70 },\n  export: { standard: 'web' },\n};`,
  );
  write(
    join(courseRoot, 'pages/01-section/_meta.js'),
    "export default { title: 'Section' };",
  );
  write(
    join(courseRoot, 'pages/01-section/01-lesson/_meta.js'),
    "export default { title: 'Lesson' };",
  );
  write(
    join(courseRoot, 'pages/01-section/01-lesson/page.svelte'),
    `<h1>Demo</h1>`,
  );
}

async function serve(fs?: { allow: string[] }): Promise<ViteDevServer> {
  const base = buildInlineConfig(courseRoot, ws);
  const server = await createServer({
    ...base,
    logLevel: 'silent',
    server: fs ? { ...base.server, fs } : base.server,
  });
  onTestFinished(() => server.close());
  await server.listen();
  return server;
}

describe('dev server $shared serving (real buildInlineConfig)', () => {
  it('serves a $shared asset from outside the course root', async () => {
    setupWorkspace();
    const server = await serve();
    const url = server.resolvedUrls!.local[0];
    const res = await fetch(new URL(`/@fs${sharedCss}`, url));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('--shared-x');
  });

  it('would block that file without the workspaceRoot allowance (control)', async () => {
    setupWorkspace();
    // Narrowing fs.allow to the course root proves it's buildInlineConfig's
    // allowance, not Vite's own detection, that opens the file.
    const server = await serve({ allow: [courseRoot] });
    const url = server.resolvedUrls!.local[0];
    const res = await fetch(new URL(`/@fs${sharedCss}`, url));
    expect(res.status).toBe(403);
  });
});
