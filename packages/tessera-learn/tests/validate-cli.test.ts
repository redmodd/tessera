import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { runValidate } from '../src/plugin/validate-cli.js';

let courseRoot: string;
let counter = 0;

function createValidCourse(name: string): string {
  counter++;
  const root = resolve(
    tmpdir(),
    `tessera-validate-cli-${Date.now()}-${counter}`,
    'courses',
    name,
  );
  mkdirSync(join(root, 'pages', '01-section', '01-lesson'), {
    recursive: true,
  });
  writeFileSync(
    join(root, 'course.config.js'),
    `export default {
  title: "Test Course",
  language: "en",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
  );
  writeFileSync(
    join(root, 'pages', '01-section', '_meta.js'),
    'export default { title: "Section" };',
  );
  writeFileSync(
    join(root, 'pages', '01-section', '01-lesson', '_meta.js'),
    'export default { title: "Lesson" };',
  );
  writeFileSync(
    join(root, 'pages', '01-section', '01-lesson', 'page.svelte'),
    '<h1>Hello</h1>',
  );
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  try {
    rmSync(resolve(courseRoot, '..', '..'), { recursive: true, force: true });
  } catch {}
});

describe('runValidate accessibility tip', () => {
  beforeEach(() => {
    courseRoot = createValidCourse('getting-started');
  });

  it('points at the project a11y script with the course name', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = runValidate(courseRoot);
    expect(code).toBe(0);
    const out = log.mock.calls.flat().join('\n');
    expect(out).toContain('pnpm a11y getting-started');
    expect(out).not.toContain('pnpm exec tessera a11y');
  });
});
