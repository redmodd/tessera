import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Plugin } from 'vite';
import { virtualModule } from '../src/plugin/virtual-module.js';
import { createOverridePlugin } from '../src/plugin/override-plugin.js';
import { tesseraPlugin } from '../src/plugin/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(resolve(tmpdir(), 'tessera-virtual-test-'));
  mkdirSync(resolve(projectRoot, 'pages'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function configure(plugin: Plugin, command = 'serve') {
  (plugin.configResolved as any).call(plugin, { root: projectRoot, command });
}

function fakeServer({ loaded = true } = {}) {
  const listeners: ((event: string, file: string) => void)[] = [];
  const invalidated: string[] = [];
  const sent: unknown[] = [];
  return {
    watcher: {
      on: (_: string, fn: (typeof listeners)[number]) => listeners.push(fn),
    },
    environments: {
      client: {
        moduleGraph: {
          getModuleById: (id: string) => (loaded ? { id } : undefined),
          invalidateModule: (mod: { id: string }) => invalidated.push(mod.id),
        },
        hot: { send: (payload: unknown) => sent.push(payload) },
      },
    },
    emit: (event: string, file: string) =>
      listeners.forEach((fn) => fn(event, file)),
    invalidated,
    sent,
  };
}

describe('virtualModule', () => {
  it('filters resolveId to the id with or without a leading slash', () => {
    const { filter, handler } = virtualModule('test', 'virtual:x', () => '')
      .resolveId as any;
    expect(filter.id.test('virtual:x')).toBe(true);
    expect(filter.id.test('/virtual:x')).toBe(true);
    expect(filter.id.test('virtual:xy')).toBe(false);
    expect(filter.id.test('\0virtual:x')).toBe(false);
    expect(handler()).toBe('\0virtual:x');
  });

  it('filters load to the resolved id and passes the resolved config', () => {
    const plugin = virtualModule('test', 'virtual:x', (ctx) =>
      JSON.stringify([ctx.projectRoot, ctx.isBuild]),
    );
    configure(plugin, 'build');
    const { filter, handler } = plugin.load as any;
    expect(filter.id.test('\0virtual:x')).toBe(true);
    expect(filter.id.test('virtual:x')).toBe(false);
    expect(JSON.parse(handler())).toEqual([projectRoot, true]);
  });

  function watching(shouldReload: () => boolean, loaded = true) {
    const server = fakeServer({ loaded });
    const plugin = virtualModule('test', 'virtual:x', () => '', shouldReload);
    configure(plugin);
    (plugin.configureServer as any)(server);
    server.emit('change', 'any');
    return server;
  }

  it('invalidates the module and sends a full reload when shouldReload is true', () => {
    const server = watching(() => true);
    expect(server.invalidated).toEqual(['\0virtual:x']);
    expect(server.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('still sends a full reload when the module is not in the graph', () => {
    const server = watching(() => true, false);
    expect(server.invalidated).toEqual([]);
    expect(server.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('does nothing when shouldReload is false', () => {
    const server = watching(() => false);
    expect(server.sent).toEqual([]);
  });
});

describe('override plugin dev reload', () => {
  it('reloads only when the override file is added or removed', () => {
    const server = fakeServer();
    const plugin = createOverridePlugin({
      name: 'test',
      virtualId: 'virtual:layout',
      projectFile: 'course.layout.svelte',
    });
    configure(plugin);
    (plugin.configureServer as any)(server);

    const file = resolve(projectRoot, 'course.layout.svelte');
    server.emit('change', file);
    server.emit('add', resolve(projectRoot, 'other.svelte'));
    expect(server.sent).toEqual([]);

    server.emit('add', file);
    server.emit('unlink', file);
    expect(server.invalidated).toEqual([
      '\0virtual:layout',
      '\0virtual:layout',
    ]);
    expect(server.sent).toHaveLength(2);
  });
});

describe('manifest plugin', () => {
  function manifestPlugin() {
    const plugin = (tesseraPlugin() as Plugin[]).find(
      (p) => p.name === 'tessera:manifest',
    )!;
    configure(plugin);
    return plugin;
  }

  it('reloads on page changes and ignores other files', () => {
    const server = fakeServer();
    (manifestPlugin().configureServer as any)(server);

    server.emit('change', resolve(projectRoot, 'course.config.js'));
    server.emit('change', resolve(projectRoot, 'pages', 'notes.txt'));
    server.emit('change', resolve(projectRoot, 'pages', 'foo_meta.js'));
    server.emit('add', resolve(projectRoot, 'pages-old', 'intro.svelte'));
    expect(server.sent).toEqual([]);

    server.emit('add', resolve(projectRoot, 'pages', 'intro.svelte'));
    expect(server.invalidated).toEqual(['\0virtual:tessera-manifest']);
    expect(server.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('rebuilds the manifest on every load', () => {
    const load = (manifestPlugin().load as any).handler.bind({
      addWatchFile() {},
    });
    const before = load();
    mkdirSync(resolve(projectRoot, 'pages', '01-intro'));
    writeFileSync(
      resolve(projectRoot, 'pages', '01-intro', 'welcome.svelte'),
      '<h1>Welcome</h1>',
    );
    expect(load()).not.toBe(before);
  });

  it('watches the page and _meta.js files the manifest reads', () => {
    const lessonDir = resolve(projectRoot, 'pages', '01-intro', '01-basics');
    mkdirSync(lessonDir, { recursive: true });
    writeFileSync(resolve(projectRoot, 'pages', '01-intro', '_meta.js'), '');
    writeFileSync(resolve(lessonDir, 'welcome.svelte'), '<h1>Hi</h1>');
    const watched: string[] = [];
    (manifestPlugin().load as any).handler.call({
      addWatchFile: (file: string) => watched.push(file),
    });
    expect(watched).toEqual([
      resolve(projectRoot, 'pages', '01-intro', '_meta.js'),
      resolve(lessonDir, 'welcome.svelte'),
    ]);
  });
});
