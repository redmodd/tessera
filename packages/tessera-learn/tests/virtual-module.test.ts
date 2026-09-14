import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Plugin } from 'vite';
import { virtualModule } from '../src/plugin/virtual-module.js';
import { createOverridePlugin } from '../src/plugin/override-plugin.js';
import { tesseraPlugin } from '../src/plugin/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = resolve(
    tmpdir(),
    `tessera-virtual-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(resolve(projectRoot, 'pages'), { recursive: true });
});

afterEach(() => {
  if (existsSync(projectRoot))
    rmSync(projectRoot, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function configure(plugin: Plugin, command = 'serve') {
  (plugin.configResolved as any).call(plugin, {
    root: projectRoot,
    command,
    build: { outDir: 'dist' },
  });
}

function fakeServer() {
  const listeners: ((event: string, file: string) => void)[] = [];
  const invalidated: string[] = [];
  const sent: unknown[] = [];
  return {
    watcher: {
      on: (_: string, fn: (typeof listeners)[number]) => listeners.push(fn),
    },
    moduleGraph: {
      getModuleById: (id: string) => ({ id }),
      invalidateModule: (mod: { id: string }) => invalidated.push(mod.id),
    },
    ws: { send: (payload: unknown) => sent.push(payload) },
    emit: (event: string, file: string) =>
      listeners.forEach((fn) => fn(event, file)),
    invalidated,
    sent,
  };
}

describe('virtualModule', () => {
  it('resolves the id and its aliases to one module', () => {
    const plugin = virtualModule('test', 'virtual:x', () => '', {
      aliases: ['/virtual:x'],
    });
    const resolveId = plugin.resolveId as any;
    expect(resolveId('virtual:x')).toBe('\0virtual:x');
    expect(resolveId('/virtual:x')).toBe('\0virtual:x');
    expect(resolveId('virtual:y')).toBeNull();
  });

  it('loads with the resolved config as context', () => {
    const plugin = virtualModule('test', 'virtual:x', (ctx) =>
      JSON.stringify([ctx.projectRoot, ctx.isBuild, ctx.outDir]),
    );
    configure(plugin, 'build');
    expect((plugin.load as any)('\0virtual:y')).toBeNull();
    expect(JSON.parse((plugin.load as any)('\0virtual:x'))).toEqual([
      projectRoot,
      true,
      resolve(projectRoot, 'dist'),
    ]);
  });

  it('reload invalidates the module and sends a full reload', () => {
    const server = fakeServer();
    const plugin = virtualModule('test', 'virtual:x', () => '', {
      hooks: (ctx) => ({
        configureServer: (s) => {
          s.watcher.on('all', () => ctx.reload(s));
        },
      }),
    });
    configure(plugin);
    (plugin.configureServer as any)(server);
    server.emit('change', 'any');
    expect(server.invalidated).toEqual(['\0virtual:x']);
    expect(server.sent).toEqual([{ type: 'full-reload' }]);
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

describe('manifest plugin dev reload', () => {
  it('reloads on page changes and ignores files outside pages/', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const server = fakeServer();
    const plugin = (tesseraPlugin() as Plugin[]).find(
      (p) => p.name === 'tessera:manifest',
    )!;
    configure(plugin);
    (plugin.configureServer as any)(server);

    server.emit('change', resolve(projectRoot, 'course.config.js'));
    server.emit('change', resolve(projectRoot, 'pages', 'notes.txt'));
    expect(server.sent).toEqual([]);

    server.emit('add', resolve(projectRoot, 'pages', 'intro.svelte'));
    expect(server.invalidated).toEqual(['\0virtual:tessera-manifest']);
    expect(server.sent).toEqual([{ type: 'full-reload' }]);
  });
});
