import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNew } from '../src/plugin/new-cli.js';
import { makeWorkspace, printed } from './helpers.js';

let ws: string;

const readConfig = (name: string) =>
  readFileSync(join(ws, 'courses', name, 'course.config.js'), 'utf-8');

beforeEach(() => {
  ws = makeWorkspace();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('runNew', () => {
  it('scaffolds courses/<name>/ with the expected files and returns 0', () => {
    const code = runNew('my-lesson', ws);
    expect(code).toBe(0);
    const dir = join(ws, 'courses', 'my-lesson');
    expect(existsSync(join(dir, 'course.config.js'))).toBe(true);
    expect(existsSync(join(dir, 'layout.svelte'))).toBe(true);
    expect(existsSync(join(dir, 'pages'))).toBe(true);
    expect(existsSync(join(dir, 'styles'))).toBe(true);
  });

  it('substitutes the course title from the name', () => {
    runNew('my-lesson', ws);
    const config = readConfig('my-lesson');
    expect(config).toContain("title: 'My Lesson'");
    expect(config).not.toContain('__PROJECT_TITLE__');
  });

  it('mints a unique urn:uuid id', () => {
    runNew('my-lesson', ws);
    const config = readConfig('my-lesson');
    expect(config).toMatch(/id: 'urn:uuid:[0-9a-f-]{36}'/);
    expect(config).not.toContain('__COURSE_ID__');
  });

  it('rejects an invalid course name', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('Bad Name', ws);
    expect(code).toBe(1);
    expect(printed(err).toLowerCase()).toContain('lowercase');
  });

  it('errors when the course already exists', () => {
    mkdirSync(join(ws, 'courses', 'dup'), { recursive: true });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('dup', ws);
    expect(code).toBe(1);
    expect(printed(err)).toContain('already exists');
  });

  it('errors when run outside a workspace', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = runNew('whatever', tmpdir());
    expect(code).toBe(1);
    expect(printed(err).toLowerCase()).toContain('workspace');
  });
});
