import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveCourse,
  findWorkspaceRoot,
  listCourses,
  listMalformedCourses,
} from '../src/plugin/course-root.js';
import { makeWorkspace } from './helpers.js';

let ws: string;

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

describe('listCourses', () => {
  it('returns sorted course names that contain a course.config.js', () => {
    expect(listCourses(ws)).toEqual(['advanced', 'getting-started']);
  });

  it('ignores directories without a course.config.js', () => {
    mkdirSync(join(ws, 'courses', 'not-a-course'), { recursive: true });
    expect(listCourses(ws)).toEqual(['advanced', 'getting-started']);
  });
});

describe('listMalformedCourses', () => {
  it('flags a directory that has pages/ but no course.config.js', () => {
    mkdirSync(join(ws, 'courses', 'half-built', 'pages'), { recursive: true });
    expect(listMalformedCourses(ws)).toEqual(['half-built']);
  });

  it('does not flag legitimate non-course directories', () => {
    mkdirSync(join(ws, 'courses', 'shared-assets'), { recursive: true });
    writeFileSync(join(ws, 'courses', 'README.md'), '# courses');
    expect(listMalformedCourses(ws)).toEqual([]);
  });

  it('does not flag valid courses', () => {
    expect(listMalformedCourses(ws)).toEqual([]);
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
    expect(resolveCourse(ws, 'missing')).toEqual({
      ok: false,
      error: expect.stringMatching(/missing[^]*advanced[^]*getting-started/),
    });
  });

  it('errors with a hint when no name is given outside a course dir', () => {
    expect(resolveCourse(ws)).toEqual({
      ok: false,
      error: expect.stringMatching(/course[^]*advanced[^]*getting-started/i),
    });
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
    expect(resolveCourse(ws, 'half-built')).toEqual({
      ok: false,
      error: expect.stringMatching(/half-built[^]*course\.config\.js/),
    });
  });
});
