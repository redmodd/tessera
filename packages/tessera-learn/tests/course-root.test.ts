import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveCourse,
  findWorkspaceRoot,
  type ResolveResult,
} from '../src/plugin/course-root.js';
import { makeWorkspace } from './helpers.js';

let ws: string;

function errorOf(result: ResolveResult): string {
  expect(result.ok).toBe(false);
  return result.ok ? '' : result.error;
}

beforeEach(() => {
  ws = makeWorkspace(['getting-started', 'advanced']);
});

describe('findWorkspaceRoot', () => {
  it('finds the nearest ancestor containing courses/', () => {
    expect(findWorkspaceRoot(ws)).toBe(ws);
    expect(findWorkspaceRoot(join(ws, 'courses', 'getting-started'))).toBe(ws);
    expect(
      findWorkspaceRoot(join(ws, 'courses', 'getting-started', 'pages')),
    ).toBe(ws);
  });

  it('returns null when no workspace is found', () => {
    expect(findWorkspaceRoot(tmpdir())).toBeNull();
  });
});

describe('the course list hint', () => {
  it('lists sorted course names that contain a course.config.js', () => {
    expect(errorOf(resolveCourse(ws))).toContain(
      'Available courses:\n  advanced\n  getting-started\n',
    );
  });

  it('ignores directories without a course.config.js or pages/', () => {
    mkdirSync(join(ws, 'courses', 'shared-assets'), { recursive: true });
    writeFileSync(join(ws, 'courses', 'README.md'), '# courses');
    const error = errorOf(resolveCourse(ws));
    expect(error).not.toContain('shared-assets');
    expect(error).not.toContain('README');
    expect(error).not.toContain('Skipped');
  });

  it('flags a directory that has pages/ but no course.config.js', () => {
    mkdirSync(join(ws, 'courses', 'half-built', 'pages'), { recursive: true });
    const error = errorOf(resolveCourse(ws));
    expect(error).toContain(
      'Skipped (missing course.config.js):\n  courses/half-built',
    );
    expect(error).not.toContain('  half-built\n');
  });
});

describe('resolveCourse', () => {
  it('resolves cwd as the course root when it holds course.config.js (no name)', () => {
    const cwd = join(ws, 'courses', 'getting-started');
    const result = resolveCourse(cwd);
    expect(result).toEqual({
      ok: true,
      courseRoot: cwd,
      workspaceRoot: ws,
    });
  });

  it('resolves a named course from the workspace root', () => {
    const result = resolveCourse(ws, 'advanced');
    expect(result).toEqual({
      ok: true,
      courseRoot: join(ws, 'courses', 'advanced'),
      workspaceRoot: ws,
    });
  });

  it('lets a name argument win even when cwd is itself a course', () => {
    const cwd = join(ws, 'courses', 'getting-started');
    const result = resolveCourse(cwd, 'advanced');
    expect(result).toEqual({
      ok: true,
      courseRoot: join(ws, 'courses', 'advanced'),
      workspaceRoot: ws,
    });
  });

  it('errors and lists available courses when a named course does not exist', () => {
    const error = errorOf(resolveCourse(ws, 'missing'));
    expect(error).toContain('missing');
    expect(error).toContain('advanced');
    expect(error).toContain('getting-started');
  });

  it('errors with a hint when no name is given outside a course dir', () => {
    const error = errorOf(resolveCourse(ws));
    expect(error.toLowerCase()).toContain('course');
    expect(error).toContain('advanced');
    expect(error).toContain('getting-started');
  });

  it('does not change meaning at the workspace root as courses are added', () => {
    // A bare command from the workspace root errors with one course...
    const one = makeWorkspace(['solo']);
    expect(resolveCourse(one).ok).toBe(false);
    // ...and still errors with two — never silently picks a course.
    expect(resolveCourse(ws).ok).toBe(false);
  });

  it('rejects a path-traversing or otherwise invalid course name before resolving', () => {
    for (const name of ['../advanced', 'Bad/Name']) {
      expect(resolveCourse(ws, name)).toEqual({
        ok: false,
        error: expect.stringContaining('Invalid course name'),
      });
    }
  });

  it('errors when a name is given but cwd is not inside a workspace', () => {
    const result = resolveCourse(tmpdir(), 'getting-started');
    expect(result.ok).toBe(false);
  });

  it('surfaces a malformed course in the hint instead of silently dropping it', () => {
    mkdirSync(join(ws, 'courses', 'half-built', 'pages'), { recursive: true });
    const error = errorOf(resolveCourse(ws, 'half-built'));
    expect(error).toContain('half-built');
    expect(error).toContain('course.config.js');
  });
});
