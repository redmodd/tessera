import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
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
    // Evaluate exactly what ships: atob + TextDecoder, all browser-available
    // globals that exist in Node 24 too.
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

  it('emits a CSP meta for web export', () => {
    const html = buildHtml('web');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("object-src 'none'");
    expect(html).toContain("base-uri 'self'");
  });

  it('omits the CSP meta for LMS packages (would break iframe bridges)', () => {
    for (const standard of ['scorm12', 'scorm2004', 'cmi5', 'xapi']) {
      const html = buildHtml(standard);
      expect(html).not.toContain('Content-Security-Policy');
    }
  });
});
