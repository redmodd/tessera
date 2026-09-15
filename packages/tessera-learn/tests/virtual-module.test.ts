import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  normalizePath,
  type HotUpdateOptions,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import { virtualModule } from '../src/plugin/virtual-module.js';
import { createOverridePlugin } from '../src/plugin/override-plugin.js';
import { tesseraPlugin } from '../src/plugin/index.js';
import { BuildContext } from '../src/plugin/build-context.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = mkdtempSync(resolve(tmpdir(), 'tessera-virtual-test-'));
  mkdirSync(resolve(projectRoot, 'pages'));
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

function resolvedConfig() {
  return {
    root: projectRoot,
    command: 'serve',
    build: { outDir: 'dist' },
  } as ResolvedConfig;
}

function context() {
  const ctx = new BuildContext();
  ctx.resolve(resolvedConfig());
  return ctx;
}

function tesseraSubPlugin(name: string) {
  const plugins = tesseraPlugin() as Plugin[];
  const contextPlugin = plugins.find((p) => p.name === 'tessera:context')!;
  (contextPlugin.configResolved as any).call(contextPlugin, resolvedConfig());
  return plugins.find((p) => p.name === name)!;
}

function load(plugin: Plugin, addWatchFile = (_file: string) => {}): string {
  return (plugin.load as any).handler.call({ addWatchFile });
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
    logger: { info() {} },
    invalidated,
    sent,
  };
}

type Environment = ReturnType<typeof fakeEnvironment>;

function hotUpdate(
  plugin: Plugin,
  environment: Environment,
  type: HotUpdateOptions['type'],
  ...segments: string[]
) {
  const file = normalizePath(resolve(projectRoot, ...segments));
  return (plugin.hotUpdate as any).call({ environment }, { type, file });
}

describe('virtualModule', () => {
  it('filters resolveId to the id with or without a leading slash', () => {
    const { filter, handler } = virtualModule(
      context(),
      'test',
      'virtual:x',
      () => '',
    ).resolveId as any;
    expect(filter.id.test('virtual:x')).toBe(true);
    expect(filter.id.test('/virtual:x')).toBe(true);
    expect(filter.id.test('virtual:xy')).toBe(false);
    expect(filter.id.test('\0virtual:x')).toBe(false);
    expect(handler()).toBe('\0virtual:x');
  });

  it('filters load to the resolved id', () => {
    const plugin = virtualModule(context(), 'test', 'virtual:x', () => 'code');
    const { filter } = plugin.load as any;
    expect(filter.id.test('\0virtual:x')).toBe(true);
    expect(filter.id.test('virtual:x')).toBe(false);
    expect(load(plugin)).toBe('code');
  });

  function updated(
    shouldReload: () => boolean,
    options?: Parameters<typeof fakeEnvironment>[0],
  ) {
    const environment = fakeEnvironment(options);
    const plugin = virtualModule(
      context(),
      'test',
      'virtual:x',
      () => '',
      shouldReload,
    );
    const result = hotUpdate(plugin, environment, 'update', 'any');
    return { ...environment, result };
  }

  it('invalidates the module and sends a full reload in place of HMR when shouldReload is true', () => {
    const environment = updated(() => true);
    expect(environment.invalidated).toEqual(['\0virtual:x']);
    expect(environment.sent).toEqual([{ type: 'full-reload' }]);
    expect(environment.result).toEqual([]);
  });

  it('leaves HMR alone when shouldReload is false', () => {
    const environment = updated(() => false);
    expect(environment.sent).toEqual([]);
    expect(environment.result).toBeUndefined();
  });

  it('still sends a full reload when the module is not in the graph', () => {
    const environment = updated(() => true, { loaded: false });
    expect(environment.invalidated).toEqual([]);
    expect(environment.sent).toEqual([{ type: 'full-reload' }]);
  });

  it('ignores non-client environments', () => {
    expect(updated(() => true, { name: 'ssr' }).sent).toEqual([]);
  });
});

describe('override plugin dev reload', () => {
  it('reloads only when the override file is created or deleted', () => {
    const environment = fakeEnvironment();
    const plugin = createOverridePlugin(context(), {
      name: 'test',
      virtualId: 'virtual:layout',
      projectFile: 'course.layout.svelte',
    });

    hotUpdate(plugin, environment, 'update', 'course.layout.svelte');
    hotUpdate(plugin, environment, 'create', 'other.svelte');
    expect(environment.sent).toEqual([]);

    hotUpdate(plugin, environment, 'create', 'course.layout.svelte');
    hotUpdate(plugin, environment, 'delete', 'course.layout.svelte');
    expect(environment.sent).toHaveLength(2);
  });
});

describe('entry plugin', () => {
  it('imports framework then sorted project stylesheets', () => {
    mkdirSync(resolve(projectRoot, 'styles'));
    writeFileSync(resolve(projectRoot, 'styles', 'b.css'), '');
    writeFileSync(resolve(projectRoot, 'styles', 'a.css'), '');
    writeFileSync(resolve(projectRoot, 'styles', 'notes.txt'), '');

    const code = load(tesseraSubPlugin('tessera:entry'));
    const stylesheets = [...code.matchAll(/import '(.+)';/g)].map((m) =>
      m[1].split('/').pop(),
    );
    expect(stylesheets).toEqual([
      'theme.css',
      'base.css',
      'layout.css',
      'a.css',
      'b.css',
    ]);
  });

  it('reloads when a stylesheet is added to or removed from styles/', () => {
    const environment = fakeEnvironment();
    const plugin = tesseraSubPlugin('tessera:entry');

    hotUpdate(plugin, environment, 'update', 'styles', 'course.css');
    hotUpdate(plugin, environment, 'create', 'styles', 'nested', 'course.css');
    hotUpdate(plugin, environment, 'create', 'styles', 'notes.txt');
    hotUpdate(plugin, environment, 'create', 'course.css');
    expect(environment.sent).toEqual([]);

    hotUpdate(plugin, environment, 'create', 'styles', 'course.css');
    hotUpdate(plugin, environment, 'delete', 'styles', 'course.css');
    expect(environment.sent).toHaveLength(2);
  });
});

describe('manifest plugin', () => {
  it('reloads only when a page change alters the manifest', () => {
    const environment = fakeEnvironment();
    const plugin = tesseraSubPlugin('tessera:manifest');
    load(plugin);

    const introDir = resolve(projectRoot, 'pages', '01-intro');
    mkdirSync(introDir);
    writeFileSync(resolve(introDir, 'welcome.svelte'), '<h1>Welcome</h1>');

    hotUpdate(plugin, environment, 'update', 'course.config.js');
    hotUpdate(plugin, environment, 'update', 'pages', 'notes.txt');
    hotUpdate(plugin, environment, 'update', 'pages', 'foo_meta.js');
    hotUpdate(plugin, environment, 'create', 'pages-old', 'intro.svelte');
    expect(environment.sent).toEqual([]);

    hotUpdate(
      plugin,
      environment,
      'create',
      'pages',
      '01-intro',
      'welcome.svelte',
    );
    expect(environment.sent).toHaveLength(1);

    load(plugin);
    hotUpdate(
      plugin,
      environment,
      'update',
      'pages',
      '01-intro',
      'welcome.svelte',
    );
    expect(environment.sent).toHaveLength(1);

    writeFileSync(
      resolve(introDir, '_meta.js'),
      `export default { title: 'Getting Started' };`,
    );
    hotUpdate(plugin, environment, 'create', 'pages', '01-intro', '_meta.js');
    expect(environment.sent).toHaveLength(2);
  });

  it('watches the page and _meta.js files the manifest reads', () => {
    const lessonDir = resolve(projectRoot, 'pages', '01-intro', '01-basics');
    mkdirSync(lessonDir, { recursive: true });
    writeFileSync(resolve(projectRoot, 'pages', '01-intro', '_meta.js'), '');
    writeFileSync(resolve(lessonDir, 'welcome.svelte'), '<h1>Hi</h1>');
    const watched: string[] = [];
    load(tesseraSubPlugin('tessera:manifest'), (file) => watched.push(file));
    expect(watched).toEqual([
      resolve(projectRoot, 'pages', '01-intro', '_meta.js'),
      resolve(lessonDir, 'welcome.svelte'),
    ]);
  });
});

describe('config plugin', () => {
  it('loads course.config.js edits made between loads', () => {
    const configPath = resolve(projectRoot, 'course.config.js');
    const plugin = tesseraSubPlugin('tessera:config');

    writeFileSync(configPath, `export default { title: 'First' };`);
    utimesSync(configPath, 1, 1);
    expect(load(plugin)).toContain('"title":"First"');

    writeFileSync(configPath, `export default { title: 'Second' };`);
    utimesSync(configPath, 2, 2);
    expect(load(plugin)).toContain('"title":"Second"');
  });
});
