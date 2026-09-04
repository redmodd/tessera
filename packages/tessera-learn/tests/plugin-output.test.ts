import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  readdirSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Plugin } from 'vite';
import { tesseraPlugin } from '../src/plugin/index.js';

let projectRoot: string;

beforeEach(() => {
  projectRoot = resolve(
    tmpdir(),
    `tessera-output-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(resolve(projectRoot, 'pages'), { recursive: true });
});

afterEach(() => {
  if (existsSync(projectRoot))
    rmSync(projectRoot, { recursive: true, force: true });
});

function findPlugin(name: string): Plugin {
  const plugin = (tesseraPlugin() as Plugin[]).find((p) => p.name === name);
  if (!plugin) throw new Error(`plugin ${name} not found`);
  return plugin;
}

function writeConfig(standard: string) {
  writeFileSync(
    resolve(projectRoot, 'course.config.js'),
    `export default { title: "Café 中文 🎓", export: { standard: "${standard}" } };`,
    'utf-8',
  );
}

describe('manifest virtual module encoding', () => {
  it('round-trips non-ASCII page titles through the base64 decode', () => {
    mkdirSync(resolve(projectRoot, 'pages', '01-intro'), { recursive: true });
    writeFileSync(
      resolve(projectRoot, 'pages', '01-intro', 'welcome.svelte'),
      `<script context="module">
export const pageConfig = { title: "Café 中文 🎓 Évaluation" }
</script>
<h1>Welcome</h1>`,
      'utf-8',
    );

    const plugin = findPlugin('tessera:manifest');
    (plugin.configResolved as any).call(plugin, { root: projectRoot });
    (plugin.buildStart as any).call(plugin);
    const code = (plugin.load as any).call(
      { addWatchFile() {} },
      '\0virtual:tessera-manifest',
    ) as string;

    const expr = code.replace(/^export default /, '').replace(/;$/, '');
    const manifest = (0, eval)(expr) as { pages: { title: string }[] };
    expect(manifest.pages[0].title).toBe('Café 中文 🎓 Évaluation');
  });
});

describe('generated index.html Content-Security-Policy', () => {
  function buildHtml(standard: string): string {
    writeConfig(standard);
    const plugin = findPlugin('tessera:entry');
    (plugin.configResolved as any).call(plugin, {
      root: projectRoot,
      build: { outDir: 'dist' },
      command: 'build',
    });
    (plugin.buildStart as any).call(plugin);
    return readFileSync(resolve(projectRoot, 'index.html'), 'utf-8');
  }

  function buildHtmlFromConfig(body: string): string {
    writeFileSync(
      resolve(projectRoot, 'course.config.js'),
      `export default ${body};`,
      'utf-8',
    );
    const plugin = findPlugin('tessera:entry');
    (plugin.configResolved as any).call(plugin, {
      root: projectRoot,
      build: { outDir: 'dist' },
      command: 'build',
    });
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

  it('fails closed (no CSP) when the config cannot be read', () => {
    writeFileSync(
      resolve(projectRoot, 'course.config.js'),
      'export default {',
      'utf-8',
    );
    const plugin = findPlugin('tessera:entry');
    (plugin.configResolved as any).call(plugin, {
      root: projectRoot,
      build: { outDir: 'dist' },
      command: 'build',
    });
    (plugin.buildStart as any).call(plugin);
    const html = readFileSync(resolve(projectRoot, 'index.html'), 'utf-8');
    expect(html).not.toContain('Content-Security-Policy');
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
    const plugin = findPlugin('tessera:entry');
    (plugin.configResolved as any).call(plugin, {
      root: projectRoot,
      build: { outDir: 'dist' },
      command: 'serve',
    });
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
    const plugins = tesseraPlugin() as Plugin[];
    const get = (name: string) => {
      const plugin = plugins.find((p) => p.name === name);
      if (!plugin) throw new Error(`plugin ${name} not found`);
      return plugin;
    };
    const entry = get('tessera:entry');
    const exporter = get('tessera:export');
    const validation = get('tessera:validation');
    for (const plugin of [entry, exporter, validation]) {
      (plugin.configResolved as any).call(plugin, {
        root: projectRoot,
        command: 'build',
        build: { outDir: 'dist' },
      });
    }
    (entry.buildStart as any).call(entry);
    return { entry, exporter, validation };
  }

  function seedStaleDist() {
    mkdirSync(resolve(projectRoot, 'dist', 'tessera'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'dist', 'index.html'), '<html></html>');
    writeFileSync(resolve(projectRoot, 'dist', 'tincan.xml'), '<tincan/>');
    mkdirSync(resolve(projectRoot, 'assets'), { recursive: true });
    writeFileSync(resolve(projectRoot, 'assets', 'logo.txt'), 'logo');
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
    (exporter.writeBundle as any).call(exporter);
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

  it('leaves the gate closed when a rebuild fails before buildStart', async () => {
    writeConfig('scorm12');
    seedStaleDist();

    const { entry, exporter, validation } = buildPlugins();
    (exporter.writeBundle as any).call(exporter);
    (entry.closeBundle as any).call(entry);
    await (exporter.closeBundle as any).call(exporter);
    rmSync(resolve(projectRoot, 'dist', 'imsmanifest.xml'));
    for (const zip of readdirSync(projectRoot).filter((f) =>
      f.endsWith('.zip'),
    )) {
      rmSync(resolve(projectRoot, zip));
    }

    writeFileSync(
      resolve(projectRoot, 'course.config.js'),
      'export default { title: "Course", export: { standard: "scorm12" }, resume: "sometimes" };',
      'utf-8',
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
    writeFileSync(
      resolve(projectRoot, 'course.config.js'),
      `export default ${body};`,
      'utf-8',
    );
    const plugin = findPlugin('tessera:xapi-setup');
    (plugin.configResolved as any).call(plugin, {
      root: projectRoot,
      command: 'build',
    });
    return (plugin.load as any).call({}, '\0virtual:tessera-xapi-setup');
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
        `{ title: "T", export: { standard: "scorm12" }, xapi: [{ endpoint: "lms" }, { endpoint: "https://lrs.example/xapi/", auth: "Basic x", actor: { mbox: "mailto:a@b.c" } }] }`,
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
