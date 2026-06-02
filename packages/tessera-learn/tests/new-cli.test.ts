import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNew } from '../src/plugin/new-cli.js';

let ws: string;
let counter = 0;

function makeWorkspace(): string {
  counter++;
  const root = resolve(tmpdir(), `tessera-new-test-${Date.now()}-${counter}`);
  mkdirSync(join(root, 'courses'), { recursive: true });
  return root;
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

describe('runNew', () => {
  it('scaffolds courses/<name>/ with the expected files and returns 0', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runNew('my-lesson', ws);
    expect(code).toBe(0);
    const dir = join(ws, 'courses', 'my-lesson');
    expect(existsSync(join(dir, 'course.config.js'))).toBe(true);
    expect(existsSync(join(dir, 'layout.svelte'))).toBe(true);
    expect(existsSync(join(dir, 'pages'))).toBe(true);
    expect(existsSync(join(dir, 'styles'))).toBe(true);
  });

  it('substitutes the course title from the name', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    runNew('my-lesson', ws);
    const config = readFileSync(
      join(ws, 'courses', 'my-lesson', 'course.config.js'),
      'utf-8',
    );
    expect(config).toContain("title: 'My Lesson'");
    expect(config).not.toContain('__PROJECT_TITLE__');
  });

  it('rejects an invalid course name', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('Bad Name', ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ').toLowerCase()).toContain(
      'lowercase',
    );
  });

  it('errors when the course already exists', () => {
    mkdirSync(join(ws, 'courses', 'dup'), { recursive: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('dup', ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('already exists');
  });

  it('errors when run outside a workspace', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('whatever', tmpdir());
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ').toLowerCase()).toContain(
      'workspace',
    );
  });

  it('requires a name', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew(undefined, ws);
    expect(code).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toContain('tessera new');
  });

  it('prints usage and returns 0 for --help', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runNew('--help', ws);
    expect(code).toBe(0);
    expect(log.mock.calls.flat().join(' ')).toContain('Usage: tessera new');
  });
});
