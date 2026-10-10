import { describe, it, expect, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  BuildContext,
  isInside,
  projectFileRel,
} from '../src/plugin/build-context.js';
import { resolvedConfig, resolvedContext } from './helpers/plugin.js';
import { tempDir, writeLessonPage } from './helpers.js';

const root = resolve('/project');

function configureWith(outDir: string, command: 'build' | 'serve' = 'build') {
  new BuildContext().configure(resolvedConfig(root, command, outDir));
}

describe('BuildContext.configure', () => {
  it.each(['.', '..'])('rejects a build outDir of "%s"', (outDir) => {
    expect(() => configureWith(outDir)).toThrow(
      /must not be or contain the project root/,
    );
  });

  it('accepts an outDir inside or beside the project', () => {
    expect(() => configureWith('build')).not.toThrow();
    expect(() => configureWith('../out')).not.toThrow();
  });

  it('ignores outDir outside a build', () => {
    expect(() => configureWith('.', 'serve')).not.toThrow();
  });
});

describe('BuildContext.validate', () => {
  it('keeps no config snapshot on the dev server', () => {
    const courseRoot = tempDir();
    writeLessonPage(courseRoot);
    writeFileSync(
      resolve(courseRoot, 'course.config.js'),
      'export default { title: "Course", language: "en" };',
    );
    const ctx = resolvedContext(courseRoot, 'serve');

    ctx.validate();

    expect(() => ctx.validatedConfig()).toThrow(
      'course.config.js was read before validation ran',
    );
  });

  it('validates the read it was given instead of the file', () => {
    const courseRoot = tempDir();
    writeLessonPage(courseRoot);
    writeFileSync(resolve(courseRoot, 'course.config.js'), 'export default {');
    const ctx = new BuildContext(undefined, {
      ok: true,
      config: { title: 'Course', language: 'en', id: 'urn:course' },
    });
    ctx.configure(resolvedConfig(courseRoot, 'build'));

    ctx.validate();

    expect(ctx.validatedConfig().config.title).toBe('Course');
  });
});

describe('isInside', () => {
  it('treats a ..-prefixed directory name as inside', () => {
    expect(isInside(root, resolve(root, '..foo', 'page.svelte'))).toBe(true);
    expect(isInside(root, resolve(root, '..', 'page.svelte'))).toBe(false);
  });
});

describe('projectFileRel', () => {
  const page = join('pages', 'welcome.svelte');

  it('returns the project-relative path for an author file', () => {
    expect(projectFileRel(resolve(root, page), root)).toBe(page);
    expect(projectFileRel(resolve(root, '..foo', 'x.svelte'), root)).toBe(
      join('..foo', 'x.svelte'),
    );
  });

  it('resolves a relative filename against the cwd, as Svelte reports it', () => {
    const ws = tempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(ws);
    const course = join('courses', 'intro');
    const courseRoot = resolve(ws, course);

    expect(projectFileRel(join(course, page), courseRoot)).toBe(page);
    expect(projectFileRel(join('shared', 'Button.svelte'), courseRoot)).toBe(
      null,
    );
  });

  it.each([
    ['a missing filename', undefined],
    ['a \\0 virtual id', '\0virtual:tessera-pages'],
    ['a bare virtual id', 'virtual:tessera-main'],
    ['a file outside the project', resolve(root, '..', 'other', 'x.svelte')],
    ['a dependency', resolve(root, 'node_modules', 'lib', 'x.svelte')],
  ])('skips %s', (_label, filename) => {
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    expect(projectFileRel(filename, root)).toBeNull();
  });

  it.each([
    ['whose name contains node_modules', 'node_modules-demo'],
    ['named node_modules', 'node_modules'],
    ['whose name contains virtual:', 'virtual:labs'],
  ])('checks a project under a folder %s', (_label, folder) => {
    const nested = resolve('/work', folder, 'course');
    expect(projectFileRel(resolve(nested, page), nested)).toBe(page);
  });

  it('checks a file under a virtual:-named folder reported relative to the cwd', () => {
    const ws = tempDir();
    vi.spyOn(process, 'cwd').mockReturnValue(ws);
    const course = join('virtual:labs', 'course');
    const courseRoot = resolve(ws, course);
    mkdirSync(resolve(courseRoot, 'pages'), { recursive: true });
    writeFileSync(resolve(courseRoot, page), '');

    expect(projectFileRel(join(course, page), courseRoot)).toBe(page);
  });
});
