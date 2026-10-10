import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath, resolveConfig, type Plugin } from 'vite';
import { tesseraPlugin } from '../src/plugin/index.js';
import * as validationModule from '../src/plugin/validation.js';
import { resolvedPlugins, type Command } from './helpers/plugin.js';
import { tempDir, writeLessonPage } from './helpers.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = tempDir();
  mkdirSync(resolve(projectRoot, 'pages'));
});

function findPlugin(name: string, command: Command = 'build'): Plugin {
  return resolvedPlugins(projectRoot, command)(name);
}

function validatedBuild(): (name: string) => Plugin {
  writeLessonPage(projectRoot);
  const get = resolvedPlugins(projectRoot, 'build');
  const validation = get('tessera:validation');
  (validation.buildStart as any).call(validation);
  return get;
}

function writeConfigSource(source: string) {
  writeFileSync(resolve(projectRoot, 'course.config.js'), source, 'utf-8');
}

function writeConfig(standard: string) {
  writeConfigSource(
    `export default { title: "Café 中文 🎓", export: { standard: "${standard}" } };`,
  );
}

describe('manifest virtual module encoding', () => {
  it('round-trips non-ASCII page titles through the base64 decode', () => {
    mkdirSync(resolve(projectRoot, 'pages', '01-intro'), { recursive: true });
    writeFileSync(
      resolve(projectRoot, 'pages', '01-intro', 'welcome.svelte'),
      `<script module>
export const pageConfig = { title: "Café 中文 🎓 Évaluation" }
</script>
<h1>Welcome</h1>`,
      'utf-8',
    );

    const plugin = findPlugin('tessera:manifest');
    const code = (plugin.load as any).handler.call({
      addWatchFile() {},
    }) as string;

    const expr = code.replace(/^export default /, '').replace(/;$/, '');
    const manifest = (0, eval)(expr) as { pages: { title: string }[] };
    expect(manifest.pages[0].title).toBe('Café 中文 🎓 Évaluation');
  });
});

describe('generated index.html Content-Security-Policy', () => {
  function buildHtml(standard: string): string {
    writeConfig(standard);
    return renderIndexHtml();
  }

  function buildHtmlFromConfig(body: string): string {
    writeConfigSource(`export default ${body};`);
    return renderIndexHtml();
  }

  function renderIndexHtml(): string {
    const plugin = validatedBuild()('tessera:index-html');
    (plugin.buildStart as any).call(plugin);
    return readFileSync(resolve(projectRoot, 'index.html'), 'utf-8');
  }

  it('emits a CSP meta for web export', () => {
    const html = buildHtml('web');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'self'");
  });

  it('allows blob: frames and blob: workers, but not data: frames', () => {
    const html = buildHtml('web');
    expect(html).toContain("frame-src 'self' blob: https:");
    expect(html).toContain("worker-src 'self' blob:");
  });

  it('refuses to read the config before validation runs', () => {
    writeConfig('web');
    const plugin = findPlugin('tessera:index-html');
    expect(() => (plugin.buildStart as any).call(plugin)).toThrow(
      'course.config.js has no validated snapshot',
    );
  });

  it('refuses to read the config after a rebuild fails validation', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeConfig('web');
    const get = validatedBuild();
    const validation = get('tessera:validation');
    const plugin = get('tessera:index-html');
    writeConfigSource('export default {');
    expect(() => (validation.buildStart as any).call(validation)).toThrow(
      'Tessera validation failed',
    );
    expect(() => (plugin.buildStart as any).call(plugin)).toThrow(
      'course.config.js has no validated snapshot',
    );
  });

  it('omits the CSP meta for LMS packages (would break iframe bridges)', () => {
    for (const standard of ['scorm12', 'scorm2004', 'cmi5', 'xapi']) {
      const html = buildHtml(standard);
      expect(html).not.toContain('Content-Security-Policy');
    }
  });

  it('appends export.csp overrides onto the baseline directive', () => {
    const html = buildHtmlFromConfig(
      `{ title: "T", export: { standard: "web", csp: { "font-src": ["https://fonts.gstatic.com"] } } }`,
    );
    expect(html).toContain("font-src 'self' data: https://fonts.gstatic.com");
  });

  it('drops the CSP meta when export.csp is false', () => {
    const html = buildHtmlFromConfig(
      `{ title: "T", export: { standard: "web", csp: false } }`,
    );
    expect(html).not.toContain('Content-Security-Policy');
  });

  it('ignores a malformed export.csp and keeps the baseline', () => {
    const html = buildHtmlFromConfig(
      `{ title: "T", export: { standard: "web", csp: { "font-src": "https://x" } } }`,
    );
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("font-src 'self' data:");
    expect(html).not.toContain('https://x');
  });

  it('omits the CSP meta from the dev server (would block Vite HMR)', async () => {
    writeConfig('web');
    const plugin = findPlugin('tessera:index-html', 'serve');
    let handler: any;
    const server = {
      middlewares: {
        use(h: any) {
          handler = h;
        },
      },
      async transformIndexHtml(_url: string, html: string) {
        return html;
      },
    };
    (plugin.configureServer as any).call(plugin, server)();

    const body = await new Promise<string>((done) => {
      handler(
        { url: '/' },
        { setHeader() {}, statusCode: 0, end: (b: string) => done(b) },
        () => {},
      );
    });
    expect(body).not.toContain('Content-Security-Policy');
  });
});

describe('export packaging gate', () => {
  function buildPlugins() {
    const get = validatedBuild();
    const entry = get('tessera:index-html');
    const exporter = get('tessera:export');
    const validation = get('tessera:validation');
    (entry.buildStart as any).call(entry);
    (get('tessera:manifest').load as any).handler.call({
      addWatchFile() {},
    });
    return { entry, exporter, validation, get };
  }

  function seedStaleDist() {
    mkdirSync(resolve(projectRoot, 'dist', 'tessera'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'dist', 'index.html'), '<html></html>');
    writeFileSync(resolve(projectRoot, 'dist', 'tincan.xml'), '<tincan/>');
    mkdirSync(resolve(projectRoot, 'assets'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'assets', 'logo.txt'), 'logo');
  }

  function writeBundle(exporter: Plugin) {
    (exporter.writeBundle as any).call(
      exporter,
      { dir: resolve(projectRoot, 'dist') },
      { 'index.html': {} },
    );
  }

  it('skips packaging and the asset copy when the build failed', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter } = buildPlugins();
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      false,
    );
    expect(existsSync(resolve(projectRoot, 'dist', 'assets', 'logo.txt'))).toBe(
      false,
    );
    expect(readdirSync(projectRoot).filter((f) => f.endsWith('.zip'))).toEqual(
      [],
    );
  });

  it('packages when the bundle was written', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter } = buildPlugins();
    writeBundle(exporter);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      true,
    );
    expect(existsSync(resolve(projectRoot, 'dist', 'assets', 'logo.txt'))).toBe(
      true,
    );
    expect(
      readdirSync(projectRoot).filter((f) => f.endsWith('.zip')),
    ).toHaveLength(1);
  });

  async function exportCmi5(
    config: string,
    pageConfig?: string,
  ): Promise<string> {
    writeConfigSource(`export default ${config};`);
    if (pageConfig) {
      mkdirSync(resolve(projectRoot, 'pages', '01-quiz'), { recursive: true });
      writeFileSync(
        resolve(projectRoot, 'pages', '01-quiz', 'check.svelte'),
        `<script module>\nexport const pageConfig = ${pageConfig}\n</script>\n<h1>Check</h1>`,
        'utf-8',
      );
    }
    seedStaleDist();

    const { entry, exporter } = buildPlugins();
    writeBundle(exporter);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    return readFileSync(resolve(projectRoot, 'dist', 'cmi5.xml'), 'utf-8');
  }

  it('packages a manual-mode cmi5 course with no masteryScore', async () => {
    const xml = await exportCmi5(
      '{ title: "Course", completion: { mode: "manual" }, export: { standard: "cmi5" } }',
    );
    expect(xml).not.toContain('masteryScore');
    expect(xml).toContain('moveOn="Completed"');
  });

  const quizVerdictConfig =
    '{ title: "Course", success: { from: "quiz" }, scoring: { passingScore: 70 }, export: { standard: "cmi5" } }';

  it('asks for a Passed when a graded page is required', async () => {
    const xml = await exportCmi5(
      quizVerdictConfig,
      '{ quiz: { graded: true } }',
    );
    expect(xml).toContain('moveOn="CompletedAndPassed"');
  });

  it('satisfies on Completed when every graded page is optional', async () => {
    const xml = await exportCmi5(
      quizVerdictConfig,
      '{ required: false, quiz: { graded: true } }',
    );
    expect(xml).toContain('moveOn="Completed"');
  });

  function undefinedImportLog(id: string) {
    return {
      code: 'IMPORT_IS_UNDEFINED',
      id,
      message: 'Import `notReal` will always be undefined',
    };
  }

  const throwingCtx = {
    error(log: { message: string }) {
      throw new Error(log.message);
    },
  };

  it('fails the build, removes the written bundle, and skips packaging on an undefined import in course code', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter } = buildPlugins();
    writeBundle(exporter);
    expect(() =>
      (exporter.onLog as any).call(
        throwingCtx,
        'warn',
        undefinedImportLog(resolve(projectRoot, 'pages', 'welcome.svelte')),
      ),
    ).toThrow(/notReal/);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    expect(existsSync(resolve(projectRoot, 'dist', 'index.html'))).toBe(false);
    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      false,
    );
    expect(readdirSync(projectRoot).filter((f) => f.endsWith('.zip'))).toEqual(
      [],
    );
  });

  it('fails the build on an undefined import when a parent folder name contains node_modules', () => {
    projectRoot = resolve(projectRoot, 'node_modules-demo', 'course');
    mkdirSync(resolve(projectRoot, 'pages'), { recursive: true });
    writeConfig('scorm12');

    const { exporter } = buildPlugins();
    expect(() =>
      (exporter.onLog as any).call(
        throwingCtx,
        'warn',
        undefinedImportLog(resolve(projectRoot, 'pages', 'welcome.svelte')),
      ),
    ).toThrow(/notReal/);
  });

  it('lets an undefined import inside node_modules through as a warning', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter } = buildPlugins();
    writeBundle(exporter);
    expect(() =>
      (exporter.onLog as any).call(
        throwingCtx,
        'warn',
        undefinedImportLog(
          resolve(projectRoot, 'node_modules', 'lib', 'index.js'),
        ),
      ),
    ).not.toThrow();
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    expect(existsSync(resolve(projectRoot, 'dist', 'index.html'))).toBe(true);
    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      true,
    );
  });

  it('packages the validated config when course.config.js changes mid-build', async () => {
    writeConfig('scorm12');
    seedStaleDist();
    const { entry, exporter, get } = buildPlugins();
    writeConfigSource('export default { export: "scorm12" };');
    expect((get('tessera:adapter').load as any).handler()).toContain(
      'SCORM12Adapter',
    );
    writeBundle(exporter);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);

    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      true,
    );
    expect(
      readdirSync(projectRoot).filter((f) => f.endsWith('.zip')),
    ).toHaveLength(1);
  });

  it('leaves the gate closed when a rebuild fails before buildStart', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter, validation } = buildPlugins();
    writeBundle(exporter);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);
    rmSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'));
    for (const zip of readdirSync(projectRoot).filter((f) =>
      f.endsWith('.zip'),
    )) {
      rmSync(resolve(projectRoot, zip));
    }

    writeConfigSource(
      'export default { title: "Course", export: { standard: "scorm12" }, resume: "sometimes" };',
    );
    expect(() => (validation.buildStart as any).call(validation)).toThrow();

    for (let i = 0; i < 2; i++) {
      (entry.closeBundle as any).call(entry);
      await (exporter.closeBundle as any).call(exporter);
    }

    expect(existsSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'))).toBe(
      false,
    );
    expect(readdirSync(projectRoot).filter((f) => f.endsWith('.zip'))).toEqual(
      [],
    );
  });
});

describe('xapi setup virtual module', () => {
  function loadSetup(body: string): string {
    writeConfigSource(`export default ${body};`);
    const plugin = validatedBuild()('tessera:xapi-setup');
    return (plugin.load as any).handler.call({});
  }

  const real = `export { buildXAPIClient }`;

  it('stubs the client when the only xapi entry is an inert lms endpoint', () => {
    for (const standard of ['scorm12', 'scorm2004', 'web']) {
      expect(
        loadSetup(
          `{ title: "T", export: { standard: "${standard}" }, xapi: { endpoint: "lms" } }`,
        ),
      ).not.toContain(real);
    }
  });

  it('wires the client for an explicit endpoint alongside an inert lms entry', () => {
    expect(
      loadSetup(
        `{ title: "T", export: { standard: "scorm12" }, xapi: [{ endpoint: "lms" }, { id: "lrs", endpoint: "https://lrs.example/xapi/", auth: "eDp5", actor: { mbox: "mailto:a@b.c" }, activityId: "https://example.com/course" }] }`,
      ),
    ).toContain(real);
  });

  it('wires the client for endpoint: "lms" under cmi5 and xapi', () => {
    for (const standard of ['cmi5', 'xapi']) {
      expect(
        loadSetup(
          `{ title: "T", export: { standard: "${standard}" }, xapi: { endpoint: "lms" } }`,
        ),
      ).toContain(real);
    }
  });
});

describe('dev terminal clearing', () => {
  async function resolvedClearScreen(clearScreen?: boolean) {
    const config = await resolveConfig(
      {
        root: projectRoot,
        configFile: false,
        clearScreen,
        plugins: [tesseraPlugin()],
      },
      'serve',
    );
    return config.clearScreen;
  }

  it('keeps Vite from clearing diagnostics off the terminal', async () => {
    expect(await resolvedClearScreen()).toBe(false);
  });

  it('leaves clearing on for a config that asks for it', async () => {
    expect(await resolvedClearScreen(true)).toBe(true);
  });
});

describe('dev revalidation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const lessonDir = 'pages/01-section/01-lesson';

  function startDev(): Plugin {
    writeLessonPage(projectRoot);
    writeConfig('web');
    const validation = findPlugin('tessera:validation', 'serve');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    (validation.configureServer as any).call(validation);
    return validation;
  }

  function notify(
    validation: Plugin,
    file: string,
    { read = () => '' as unknown, type = 'update' } = {},
  ) {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    (validation.hotUpdate as any).call(
      { environment: { name: 'client' } },
      { type, file: normalizePath(resolve(projectRoot, file)), read },
    );
    return errors;
  }

  async function hotUpdate(...change: Parameters<typeof notify>) {
    const errors = notify(...change);
    await vi.runAllTimersAsync();
    return errors;
  }

  it.each([
    'course.config.js',
    'course.runtime.js',
    'layout.svelte',
    'quiz.svelte',
    'pages/01-section/_meta.js',
    `${lessonDir}/page.svelte`,
  ])('revalidates when %s changes', async (file) => {
    const validation = startDev();
    writeConfigSource('export default {');

    expect(await hotUpdate(validation, file)).toHaveBeenCalledWith(
      expect.stringContaining('course.config.js: could not parse'),
    );
  });

  it.each(['assets/logo.svg', 'pages/01-section/notes.md', 'notes.svelte'])(
    'does not revalidate when %s changes',
    async (file) => {
      const validation = startDev();
      writeConfigSource('export default {');

      expect(await hotUpdate(validation, file)).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'delete'])(
    'revalidates on an asset %s without reading the asset',
    async (type) => {
      const validation = startDev();
      writeConfigSource('export default {');
      const read = vi.fn();

      const errors = await hotUpdate(validation, 'assets/logo.svg', {
        read,
        type,
      });

      expect(errors).toHaveBeenCalledOnce();
      expect(read).not.toHaveBeenCalled();
    },
  );

  it.each(['assets', lessonDir])(
    'validates once for files the watcher reports apart under %s',
    async (dir) => {
      const validation = startDev();
      writeConfigSource('export default {');

      notify(validation, `${dir}/a.svelte`, { type: 'create' });
      await vi.advanceTimersByTimeAsync(30);
      expect(
        await hotUpdate(validation, `${dir}/b.svelte`, { type: 'create' }),
      ).toHaveBeenCalledOnce();
    },
  );

  it('leaves the hot update to Vite without waiting for the validation', () => {
    const validation = startDev();
    writeConfigSource('export default {');

    expect(
      (validation.hotUpdate as any).call(
        { environment: { name: 'client' } },
        {
          type: 'update',
          file: normalizePath(resolve(projectRoot, 'course.config.js')),
          read: () => '',
        },
      ),
    ).toBeUndefined();
  });

  it('validates once for saves that land together', async () => {
    const validation = startDev();
    writeConfigSource('export default {');

    const [errors] = await Promise.all([
      hotUpdate(validation, 'course.config.js'),
      hotUpdate(validation, 'layout.svelte'),
    ]);

    expect(errors).toHaveBeenCalledOnce();
  });

  it('waits for a save that starts while another is read', async () => {
    const validation = startDev();
    writeConfigSource('');
    const slowSave = async () => {
      await new Promise((done) => setTimeout(done, 200));
      writeConfig('web');
    };

    const [errors] = await Promise.all([
      hotUpdate(validation, 'layout.svelte'),
      hotUpdate(validation, 'course.config.js', { read: slowSave }),
    ]);

    expect(errors).not.toHaveBeenCalled();
  });

  it('waits for a save still in progress before validating', async () => {
    const validation = startDev();
    writeConfigSource('');

    const errors = await hotUpdate(validation, 'course.config.js', {
      read: () => writeConfig('web'),
    });

    expect(errors).not.toHaveBeenCalled();
  });

  it('revalidates a file that is gone before it can be read', async () => {
    const validation = startDev();
    rmSync(resolve(projectRoot, 'course.config.js'));

    const errors = await hotUpdate(validation, 'course.config.js', {
      read: () => Promise.reject(new Error('ENOENT')),
    });

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('course.config.js: not found in project root'),
    );
  });

  it('revalidates a deleted file without waiting on a read of it', async () => {
    const validation = startDev();
    rmSync(resolve(projectRoot, 'course.config.js'));
    const read = vi.fn();

    const errors = await hotUpdate(validation, 'course.config.js', {
      read,
      type: 'delete',
    });

    expect(errors).toHaveBeenCalledWith(
      expect.stringContaining('course.config.js: not found in project root'),
    );
    expect(read).not.toHaveBeenCalled();
  });

  it('reports a validation that throws instead of failing the hot update', async () => {
    const validation = startDev();
    vi.spyOn(validationModule, 'validateProject').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory');
    });

    expect(
      await hotUpdate(validation, 'course.config.js'),
    ).toHaveBeenCalledWith(
      expect.stringContaining('validation could not run: ENOENT'),
    );
  });

  it('reports errors on a restart instead of failing it', () => {
    const validation = startDev();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const infos = vi.spyOn(console, 'log').mockImplementation(() => {});
    const restart = () => {
      (validation.configureServer as any).call(validation);
      (validation.closeServer as any).call(validation, { reason: 'restart' });
    };

    writeConfigSource('export default {');
    restart();
    expect(errors).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('course.config.js: could not parse'),
    );

    writeConfig('web');
    restart();
    expect(infos).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('validation errors resolved'),
    );
  });

  it('reports errors on a restart that rebuilds the plugin', () => {
    startDev();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});

    writeConfigSource('export default {');
    const rebuilt = findPlugin('tessera:validation', 'serve');
    (rebuilt.configureServer as any).call(rebuilt);

    expect(errors).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('course.config.js: could not parse'),
    );
  });

  it('reports every standing warning again on a restart', () => {
    const validation = startDev();
    const warnings = vi.mocked(console.warn);
    const standing = warnings.mock.calls.length;
    expect(standing).toBeGreaterThan(0);

    (validation.configureServer as any).call(validation);
    expect(warnings).toHaveBeenCalledTimes(standing * 2);
  });

  it('refuses to start a server on a project with errors', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeConfigSource('export default {');
    const validation = findPlugin('tessera:validation', 'serve');

    expect(() => (validation.configureServer as any).call(validation)).toThrow(
      'Tessera validation failed',
    );
  });

  it('refuses a project with errors again once its server has closed', () => {
    const validation = startDev();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    (validation.closeServer as any).call(validation, { reason: 'close' });
    writeConfigSource('export default {');

    expect(() => (validation.configureServer as any).call(validation)).toThrow(
      'Tessera validation failed',
    );
  });

  it('says when the errors it reported are resolved', async () => {
    const validation = startDev();
    const infos = vi.spyOn(console, 'log').mockImplementation(() => {});

    await hotUpdate(validation, 'course.config.js');
    writeConfigSource('export default {');
    await hotUpdate(validation, 'course.config.js');
    expect(infos).not.toHaveBeenCalled();

    writeConfig('web');
    await hotUpdate(validation, 'course.config.js');
    await hotUpdate(validation, 'course.config.js');
    expect(infos).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('validation errors resolved'),
    );
  });

  it('reports a warning once and an error on every save', async () => {
    const withUnknownField = `export default { title: "T", export: { standard: "web" }, extra: 1 };`;
    const validation = startDev();
    const warnings = vi.mocked(console.warn);
    const save = async (source: string) => {
      writeConfigSource(source);
      return hotUpdate(validation, 'course.config.js');
    };

    expect(warnings).toHaveBeenCalled();
    warnings.mockClear();

    await save(withUnknownField);
    expect(warnings).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('unknown field "extra"'),
    );
    warnings.mockClear();

    const errors = await save('export default {');
    await save('export default {');
    expect(errors).toHaveBeenCalledTimes(2);

    await save(withUnknownField);
    expect(warnings).not.toHaveBeenCalled();
  });

  it('reports a warning that comes back while an unrelated error stands', async () => {
    const validation = startDev();
    writeFileSync(
      resolve(projectRoot, lessonDir, 'broken.svelte'),
      '<script module>export const pageConfig = makeConfig();</script>',
    );
    const warnings = vi.mocked(console.warn);
    const unknownField = expect.stringContaining('unknown field "extra"');
    const save = async (extra: string) => {
      writeConfigSource(
        `export default { title: "T", export: { standard: "web" }${extra} };`,
      );
      await hotUpdate(validation, 'course.config.js');
    };

    await save(', extra: 1');
    await save('');
    expect(warnings).toHaveBeenCalledWith(unknownField);
    warnings.mockClear();

    await save(', extra: 1');
    expect(warnings).toHaveBeenCalledWith(unknownField);
  });

  it.each([
    [
      'page.svelte',
      '<script module>export const pageConfig = { weight: 2 };</script>',
      '<script module>export const pageConfig = {</script>',
    ],
    [
      '_meta.js',
      `export default { title: "Lesson", pages: ["page", "page"] };`,
      'export default {',
    ],
  ])(
    'does not repeat a standing warning once %s parses again',
    async (name, source, typo) => {
      const validation = startDev();
      const warnings = vi.mocked(console.warn);
      const save = async (content: string) => {
        writeFileSync(resolve(projectRoot, lessonDir, name), content);
        await hotUpdate(validation, `${lessonDir}/${name}`);
      };

      await save(source);
      expect(warnings).toHaveBeenLastCalledWith(
        expect.stringContaining(`${lessonDir}/${name}`),
      );
      warnings.mockClear();

      await save(typo);
      await save(source);
      expect(warnings).not.toHaveBeenCalled();
    },
  );
});
