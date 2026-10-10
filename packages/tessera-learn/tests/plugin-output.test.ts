import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { normalizePath, type Plugin } from 'vite';
import { resolvedPlugins, type Command } from './helpers/plugin.js';
import { tempDir } from './helpers.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = tempDir();
  mkdirSync(resolve(projectRoot, 'pages'));
});

function findPlugin(name: string, command: Command = 'build'): Plugin {
  return resolvedPlugins(projectRoot, command)(name);
}

function writeLessonPage() {
  const lesson = resolve(projectRoot, 'pages', '01-section', '01-lesson');
  mkdirSync(lesson, { recursive: true });
  writeFileSync(resolve(lesson, 'page.svelte'), '<h1>Page</h1>', 'utf-8');
}

function validatedBuild(): (name: string) => Plugin {
  writeLessonPage();
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
      'course.config.js was read before validation ran',
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
      'course.config.js was read before validation ran',
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

  it.each([
    ['a syntax error', 'export default {'],
    ['a non-data value', 'export default { title: someVariable };'],
    ['a non-object export', 'export default { export: "scorm12" };'],
    [
      'an unknown standard',
      'export default { export: { standard: "scorm13" } };',
    ],
  ])(
    'packages the validated config when course.config.js changes mid-build to %s',
    async (_case, source) => {
      writeConfig('scorm12');
      seedStaleDist();
      const { entry, exporter, get } = buildPlugins();
      writeConfigSource(source);
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
    },
  );

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

describe('dev config revalidation', () => {
  async function hotUpdate(file: string, read: () => unknown = () => '') {
    const validation = findPlugin('tessera:validation', 'serve');
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    await (validation.hotUpdate as any).call(
      { environment: { name: 'client' } },
      {
        type: 'update',
        file: normalizePath(resolve(projectRoot, file)),
        read,
      },
    );
    return errors;
  }

  it.each(['course.config.js', 'course.runtime.js'])(
    'reports errors when %s changes',
    async (file) => {
      writeConfig('web');
      writeFileSync(resolve(projectRoot, file), 'export default {', 'utf-8');

      expect(await hotUpdate(file)).toHaveBeenCalledWith(
        expect.stringContaining(`${file}: could not parse`),
      );
    },
  );

  it('waits for a save still in progress before validating', async () => {
    writeLessonPage();
    writeConfigSource('');

    const errors = await hotUpdate('course.config.js', () =>
      writeConfig('web'),
    );

    expect(errors).not.toHaveBeenCalled();
  });
});
