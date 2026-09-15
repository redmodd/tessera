import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizePath, type Plugin } from 'vite';
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

function fakeEnvironment({ name = 'client', loaded = true } = {}) {
  const invalidated: string[] = [];
  const sent: unknown[] = [];
  return {
    name,
    moduleGraph: {
      getModuleById: (id: string) => (loaded ? { id } : undefined),
      invalidateModule: (mod: { id: string }) => invalidated.push(mod.id),
    },
    hot: { send: (payload: unknown) => sent.push(payload) },
    invalidated,
    sent,
  };
}

type Environment = ReturnType<typeof fakeEnvironment>;

function hotUpdate(
  plugin: Plugin,
  environment: Environment,
  type: string,
  ...segments: string[]
) {
  const file = normalizePath(resolve(projectRoot, ...segments));
  (plugin.hotUpdate as any).call({ environment }, { type, file });
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

  function updated(
    shouldReload: () => boolean,
    options?: Parameters<typeof fakeEnvironment>[0],
  ) {
    const environment = fakeEnvironment(options);
    const plugin = virtualModule('test', 'virtual:x', () => '', shouldReload);
    configure(plugin);
    hotUpdate(plugin, environment, 'update', 'any');
    return environment;
  }

  it('invalidates the module and sends a full reload when shouldReload is true', () => {
    const environment = updated(() => true);
    expect(environment.invalidated).toEqual(['\0virtual:x']);
    expect(environment.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('still sends a full reload when the module is not in the graph', () => {
    const environment = updated(() => true, { loaded: false });
    expect(environment.invalidated).toEqual([]);
    expect(environment.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('does nothing when shouldReload is false', () => {
    expect(updated(() => false).sent).toEqual([]);
  });

  it('ignores non-client environments', () => {
    expect(updated(() => true, { name: 'ssr' }).sent).toEqual([]);
  });
});

describe('override plugin dev reload', () => {
  it('reloads only when the override file is created or deleted', () => {
    const environment = fakeEnvironment();
    const plugin = createOverridePlugin({
      name: 'test',
      virtualId: 'virtual:layout',
      projectFile: 'course.layout.svelte',
    });
    configure(plugin);

    hotUpdate(plugin, environment, 'update', 'course.layout.svelte');
    hotUpdate(plugin, environment, 'create', 'other.svelte');
    expect(environment.sent).toEqual([]);

    hotUpdate(plugin, environment, 'create', 'course.layout.svelte');
    hotUpdate(plugin, environment, 'delete', 'course.layout.svelte');
    expect(environment.invalidated).toEqual([
      '\0virtual:layout',
      '\0virtual:layout',
    ]);
    expect(environment.sent).toHaveLength(2);
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
    const environment = fakeEnvironment();
    const plugin = manifestPlugin();

    hotUpdate(plugin, environment, 'update', 'course.config.js');
    hotUpdate(plugin, environment, 'update', 'pages', 'notes.txt');
    hotUpdate(plugin, environment, 'update', 'pages', 'foo_meta.js');
    hotUpdate(plugin, environment, 'create', 'pages-old', 'intro.svelte');
    expect(environment.sent).toEqual([]);

    hotUpdate(plugin, environment, 'create', 'pages', 'intro.svelte');
    hotUpdate(plugin, environment, 'update', 'pages', '01', '_meta.js');
    expect(environment.invalidated).toEqual([
      '\0virtual:tessera-manifest',
      '\0virtual:tessera-manifest',
    ]);
    expect(environment.sent).toHaveLength(2);
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
