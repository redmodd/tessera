import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizePath } from 'vite';

import { tesseraLayoutPlugin } from '../src/plugin/layout.js';
import { BuildContext } from '../src/plugin/build-context.js';

describe('tessera:layout virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = resolve(
      tmpdir(),
      `tessera-layout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectRoot))
      rmSync(projectRoot, { recursive: true, force: true });
  });

  function makePlugin() {
    const ctx = new BuildContext();
    ctx.resolve({ root: projectRoot, build: { outDir: 'dist' } } as never);
    return tesseraLayoutPlugin(ctx);
  }

  it('load() returns null re-export when no layout.svelte exists', () => {
    const code = (makePlugin() as any).load.handler();
    expect(code).toMatch(/export\s+default\s+null/);
  });

  it('load() re-exports the project layout.svelte when present', () => {
    const layoutPath = resolve(projectRoot, 'layout.svelte');
    writeFileSync(layoutPath, '<div>custom layout</div>');

    const code = (makePlugin() as any).load.handler();

    expect(code).toContain(`from '${normalizePath(layoutPath)}'`);
    expect(code).toMatch(/export\s+\{\s*default\s*\}/);
  });
});
