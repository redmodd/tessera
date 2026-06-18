import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runDuplicate } from '../src/plugin/duplicate-cli.js';

let ws: string;
let counter = 0;

function makeWorkspace(): string {
  counter++;
  const root = resolve(tmpdir(), `tessera-dup-test-${Date.now()}-${counter}`);
  mkdirSync(join(root, 'courses'), { recursive: true });
  return root;
}

function seedCourse(name: string): string {
  const dir = join(ws, 'courses', name);
  mkdirSync(join(dir, 'pages'), { recursive: true });
  writeFileSync(
    join(dir, 'course.config.js'),
    "export default { title: 'Src' };",
  );
  writeFileSync(join(dir, 'pages', 'index.svelte'), '<h1>hi</h1>');
  return dir;
}

// Seed courses/src with a hand-written config to exercise the id rewriter.
function writeSrcConfig(config: string): string {
  const src = join(ws, 'courses', 'src');
  mkdirSync(join(src, 'pages'), { recursive: true });
  writeFileSync(join(src, 'course.config.js'), config);
  writeFileSync(join(src, 'pages', 'index.svelte'), '<h1>hi</h1>');
  return src;
}

function readCopyConfig(): string {
  return readFileSync(join(ws, 'courses', 'copy', 'course.config.js'), 'utf-8');
}

beforeEach(() => {
  ws = makeWorkspace();
});

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(ws, { recursive: true, force: true });
  } catch {}
});

describe('runDuplicate', () => {
  it('copies source files, skips build artifacts, leaves the source intact', () => {
    const src = seedCourse('src');
    // Artifacts that must not travel with the copy.
    mkdirSync(join(src, 'dist'), { recursive: true });
    writeFileSync(join(src, 'dist', 'index.html'), '<html></html>');
    writeFileSync(join(src, 'a11y-report.json'), '{}');
    mkdirSync(join(src, 'node_modules', '.tessera-a11y'), { recursive: true });
    writeFileSync(join(src, 'node_modules', '.tessera-a11y', 'index.html'), '');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runDuplicate('src', 'copy', ws);
    expect(code).toBe(0);

    const dest = join(ws, 'courses', 'copy');
    expect(existsSync(join(dest, 'course.config.js'))).toBe(true);
    expect(existsSync(join(dest, 'pages', 'index.svelte'))).toBe(true);
    expect(readFileSync(join(dest, 'course.config.js'), 'utf-8')).toContain(
      "title: 'Src'",
    );

    expect(existsSync(join(dest, 'dist'))).toBe(false);
    expect(existsSync(join(dest, 'a11y-report.json'))).toBe(false);
    expect(existsSync(join(dest, 'node_modules'))).toBe(false);

    // Source untouched.
    expect(existsSync(join(src, 'dist', 'index.html'))).toBe(true);
    expect(existsSync(join(src, 'a11y-report.json'))).toBe(true);
  });

  it('regenerates the course id so the copy is a distinct course', () => {
    const src = writeSrcConfig(
      "export default { title: 'Src', id: 'urn:uuid:original' };",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
    // Source id is untouched.
    expect(readFileSync(join(src, 'course.config.js'), 'utf-8')).toContain(
      'urn:uuid:original',
    );
  });

  it('injects an id when the source course has none', () => {
    seedCourse('src');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);
    expect(readCopyConfig()).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('regenerates a backtick-quoted id', () => {
    writeSrcConfig('export default { title: "Src", id: `urn:uuid:original` };');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('rewrites only the top-level id, never a nested id: key', () => {
    writeSrcConfig(
      "export default { title: 'Src', branding: { logo: { id: 'logo-1' } }, id: 'urn:uuid:original' };",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).toContain("id: 'logo-1'");
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('replaces a non-string id in place rather than duplicating the key', () => {
    writeSrcConfig("export default { title: 'Src', id: 123 };");

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy.match(/\bid\s*:/g)).toHaveLength(1);
    expect(copy).not.toContain('id: 123');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('injects an id when only a comment mentions id:', () => {
    writeSrcConfig('// set the id: below\nexport default { title: "Src" };');

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);
    expect(readCopyConfig()).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('regenerates the real id past a comment that contains an apostrophe', () => {
    writeSrcConfig(
      "export default {\n  // Acme's onboarding course\n  title: 'X',\n  id: 'urn:uuid:original',\n};",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
    // The comment is untouched and no second top-level id key is injected.
    expect(copy).toContain("// Acme's onboarding course");
    expect(copy.match(/^\s*id\s*:/gm)).toHaveLength(1);
  });

  it('ignores an id: written inside a comment above the real id', () => {
    writeSrcConfig(
      "export default {\n  // remember to set the id: properly\n  title: 'X',\n  id: 'urn:uuid:original',\n};",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toContain('// remember to set the id: properly');
    expect(copy.match(/^\s*id\s*:/gm)).toHaveLength(1);
  });

  it('regenerates the id of an indirectly exported config', () => {
    writeSrcConfig(
      "const config = { title: 'X', id: 'urn:uuid:original' };\nexport default config;",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('injects an id into an indirectly exported config that has none', () => {
    writeSrcConfig("const config = { title: 'X' };\nexport default config;");

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);
    expect(readCopyConfig()).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('regenerates the id of a wrapped (call-form) export', () => {
    writeSrcConfig(
      "export default defineConfig({ title: 'Src', id: 'urn:uuid:original' });",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy).toContain('defineConfig(');
    expect(copy).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('injects an id into a wrapped export that has none', () => {
    writeSrcConfig("export default defineConfig({ title: 'Src' });");

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);
    expect(readCopyConfig()).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('rewrites a quoted top-level id key in place', () => {
    writeSrcConfig(
      "export default { title: 'Src', 'id': 'urn:uuid:original' };",
    );

    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);

    const copy = readCopyConfig();
    expect(copy).not.toContain('urn:uuid:original');
    expect(copy.match(/\bid'?\s*:/g)).toHaveLength(1);
    expect(copy).toMatch(/id': 'urn:uuid:[0-9a-f-]{36}'/);
  });

  it('warns and leaves identity unset when the config shape is unrecognized', () => {
    writeSrcConfig("export default makeConfig('src');");

    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(runDuplicate('src', 'copy', ws)).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Could not set a unique id'),
    );
    expect(readCopyConfig()).toContain("makeConfig('src')");
  });

  it('requires both arguments', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(runDuplicate('src', undefined, ws)).toBe(1);
    expect(runDuplicate(undefined, 'copy', ws)).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain(
      'Usage: tessera duplicate',
    );
  });

  it('rejects an invalid <new> name', () => {
    seedCourse('src');
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runDuplicate('src', 'Bad Name', ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ').toLowerCase()).toContain(
      'lowercase',
    );
    expect(existsSync(join(ws, 'courses', 'Bad Name'))).toBe(false);
  });

  it('errors when <source> is not a course', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runDuplicate('missing', 'copy', ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('not found');
    expect(existsSync(join(ws, 'courses', 'copy'))).toBe(false);
  });

  it('errors when run outside a workspace', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runDuplicate('src', 'copy', tmpdir());
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ').toLowerCase()).toContain(
      'workspace',
    );
  });

  it('refuses when <new> already exists and leaves it untouched', () => {
    seedCourse('src');
    const dest = join(ws, 'courses', 'copy');
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, 'marker.txt'), 'original');

    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runDuplicate('src', 'copy', ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('already exists');
    // Pre-existing dir untouched, no partial overwrite.
    expect(readFileSync(join(dest, 'marker.txt'), 'utf-8')).toBe('original');
    expect(existsSync(join(dest, 'course.config.js'))).toBe(false);
  });

  it('copies a source course whose name collides with a skip entry', () => {
    seedCourse('dist');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runDuplicate('dist', 'copy', ws);
    expect(code).toBe(0);

    const dest = join(ws, 'courses', 'copy');
    expect(existsSync(join(dest, 'course.config.js'))).toBe(true);
    expect(existsSync(join(dest, 'pages', 'index.svelte'))).toBe(true);
  });

  it('prints the synopsis and returns 0 for --help in either positional', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(runDuplicate('--help', undefined, ws)).toBe(0);
    expect(runDuplicate('src', '--help', ws)).toBe(0);
    expect(runDuplicate('src', '-h', ws)).toBe(0);
    expect(log.mock.calls.flat().join(' ')).toContain(
      'Usage: tessera duplicate',
    );
  });
});
