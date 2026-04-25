import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { tesseraLayoutPlugin } from '../src/plugin/layout.js';

describe('tessera:layout virtual module', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = resolve(tmpdir(), `tessera-layout-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(projectRoot, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
  });

  function makePlugin() {
    const plugin = tesseraLayoutPlugin();
    // Manually invoke the lifecycle hooks so we can test load() without spinning up Vite.
    (plugin as any).configResolved?.({ root: projectRoot });
    return plugin;
  }

  it('resolveId maps the public id to a resolved id', () => {
    const plugin = makePlugin();
    const resolved = (plugin as any).resolveId.call({}, 'virtual:tessera-layout');
    expect(resolved).toBe('\0virtual:tessera-layout');
    expect((plugin as any).resolveId.call({}, 'something-else')).toBeNull();
  });

  it('load() returns null re-export when no layout.svelte exists', () => {
    const plugin = makePlugin();
    const watched: string[] = [];
    const code = (plugin as any).load.call(
      { addWatchFile(p: string) { watched.push(p); } },
      '\0virtual:tessera-layout'
    );
    expect(typeof code).toBe('string');
    expect(code).toMatch(/export\s+default\s+null/);
    // Must NOT addWatchFile a non-existent path: Vite's importAnalysis
    // treats it as a real import and errors out.
    expect(watched).toHaveLength(0);
  });

  it('load() re-exports the project layout.svelte when present', () => {
    const layoutPath = resolve(projectRoot, 'layout.svelte');
    writeFileSync(layoutPath, '<div>custom layout</div>');

    const plugin = makePlugin();
    const watched: string[] = [];
    const code = (plugin as any).load.call(
      { addWatchFile(p: string) { watched.push(p); } },
      '\0virtual:tessera-layout'
    );

    expect(typeof code).toBe('string');
    const normalized = layoutPath.replace(/\\/g, '/');
    expect(code).toContain(`from '${normalized}'`);
    expect(code).toMatch(/export\s+\{\s*default\s*\}/);
    expect(watched).toContain(layoutPath);
  });

  it('load() ignores ids that are not the resolved virtual id', () => {
    const plugin = makePlugin();
    const code = (plugin as any).load.call({ addWatchFile() {} }, 'some-other-id');
    expect(code).toBeNull();
  });
});
