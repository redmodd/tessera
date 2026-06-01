import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  resolveCourse,
  findWorkspaceRoot,
  listCourses,
} from '../src/plugin/course-root.js';

let ws: string;
let counter = 0;

// Build a workspace dir tree: courses/<name>/course.config.js for each name.
function makeWorkspace(courses: string[]): string {
  counter++;
  const root = resolve(
    tmpdir(),
    `tessera-course-root-${Date.now()}-${counter}`,
  );
  mkdirSync(join(root, 'courses'), { recursive: true });
  for (const name of courses) {
    const dir = join(root, 'courses', name);
    mkdirSync(join(dir, 'pages'), { recursive: true });
    writeFileSync(join(dir, 'course.config.js'), 'export default {};');
  }
  return root;
}

beforeEach(() => {
  ws = makeWorkspace(['getting-started', 'advanced']);
});

afterEach(() => {
  try {
    rmSync(ws, { recursive: true, force: true });
  } catch {}
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
    const result = resolveCourse(ws, 'missing');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('missing');
      expect(result.error).toContain('advanced');
      expect(result.error).toContain('getting-started');
    }
  });

  it('errors with a hint when no name is given outside a course dir', () => {
    const result = resolveCourse(ws);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('advanced');
      expect(result.error).toContain('getting-started');
      expect(result.error.toLowerCase()).toContain('course');
    }
  });

  it('does not change meaning at the workspace root as courses are added', () => {
    // A bare command from the workspace root errors with one course...
    const one = makeWorkspace(['solo']);
    expect(resolveCourse(one).ok).toBe(false);
    // ...and still errors with two — never silently picks a course.
    expect(resolveCourse(ws).ok).toBe(false);
    rmSync(one, { recursive: true, force: true });
  });

  it('rejects a path-traversing or otherwise invalid course name before resolving', () => {
    const traverse = resolveCourse(ws, '../advanced');
    expect(traverse.ok).toBe(false);
    if (!traverse.ok) expect(traverse.error).toContain('Invalid course name');

    const bad = resolveCourse(ws, 'Bad/Name');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('Invalid course name');
  });

  it('errors when a name is given but cwd is not inside a workspace', () => {
    const result = resolveCourse(tmpdir(), 'getting-started');
    expect(result.ok).toBe(false);
  });
});
