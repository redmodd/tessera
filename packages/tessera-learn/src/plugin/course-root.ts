import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export interface ResolvedCourse {
  ok: true;
  courseRoot: string;
  workspaceRoot: string;
}

export type ResolveResult = ResolvedCourse | { ok: false; error: string };

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isCourse(dir: string): boolean {
  return existsSync(join(dir, 'course.config.js'));
}

// A workspace is the nearest ancestor holding a courses/ directory. The walk
// includes the starting dir, so the workspace root resolves to itself.
export function findWorkspaceRoot(cwd: string): string | null {
  for (let dir = resolve(cwd); ; dir = dirname(dir)) {
    if (isDir(join(dir, 'courses'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
  }
}

export function listCourses(workspaceRoot: string): string[] {
  const coursesDir = join(workspaceRoot, 'courses');
  try {
    return readdirSync(coursesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && isCourse(join(coursesDir, e.name)))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

const NOT_A_WORKSPACE =
  'Not inside a Tessera workspace — no `courses/` directory was found at or above the current directory.';

function listHint(workspaceRoot: string): string {
  const courses = listCourses(workspaceRoot);
  if (courses.length === 0) {
    return '\nNo courses found. Create one with `tessera new <name>`.';
  }
  return (
    `\nAvailable courses:\n${courses.map((c) => `  ${c}`).join('\n')}` +
    '\nName one (`tessera <command> <course>`) or cd into its folder.'
  );
}

// A name argument always wins; otherwise the cwd must itself be a course. There
// is deliberately no "single course → use it implicitly" rule, so a bare command
// never changes meaning when a second course is added.
export function resolveCourse(cwd: string, name?: string): ResolveResult {
  const here = resolve(cwd);

  if (name) {
    const workspaceRoot = findWorkspaceRoot(here);
    if (!workspaceRoot) return { ok: false, error: NOT_A_WORKSPACE };
    const courseRoot = join(workspaceRoot, 'courses', name);
    if (!isCourse(courseRoot)) {
      return {
        ok: false,
        error: `Course "${name}" not found in courses/.${listHint(workspaceRoot)}`,
      };
    }
    return { ok: true, courseRoot, workspaceRoot };
  }

  if (isCourse(here)) {
    const workspaceRoot = findWorkspaceRoot(here) ?? dirname(dirname(here));
    return { ok: true, courseRoot: here, workspaceRoot };
  }

  const workspaceRoot = findWorkspaceRoot(here);
  if (!workspaceRoot) return { ok: false, error: NOT_A_WORKSPACE };
  return {
    ok: false,
    error: `No course specified.${listHint(workspaceRoot)}`,
  };
}
