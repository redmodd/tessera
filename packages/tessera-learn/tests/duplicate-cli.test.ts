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
