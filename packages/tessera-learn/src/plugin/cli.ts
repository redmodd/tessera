#!/usr/bin/env node
import { runValidate } from './validate-cli.js';
import { runA11y } from './a11y-cli.js';
import { runNew } from './new-cli.js';
import { runDuplicate } from './duplicate-cli.js';
import { resolveCourse } from './course-root.js';

const USAGE = `Usage: tessera <command> [course] [options]

Commands:
  new <name>                  Scaffold a new course into courses/<name>
  duplicate <source> <new>    Copy courses/<source> to courses/<new>
  dev       [course]          Start the Vite dev server
  export    [course]          Build and package the course for its LMS standard
  validate  [course]          Fast static structure checks
  a11y      [course]          Runtime accessibility audit (builds + drives Playwright)
  check     [course]          Run validate, then a11y

Run a command from inside a course folder, or name the course explicitly.

a11y/check options:
  --threshold <minor|moderate|serious|critical>   Failing impact (default: serious)`;

// The course is a leading positional: `tessera <cmd> [course] [flags]`. Only the
// first token can be the course, and only when it isn't a flag — otherwise a flag
// value (e.g. the `serious` in `--threshold serious`) would be misread as a name.
export function splitCourseArg(rest: string[]): {
  course?: string;
  flags: string[];
} {
  if (rest.length > 0 && !rest[0].startsWith('-')) {
    return { course: rest[0], flags: rest.slice(1) };
  }
  return { course: undefined, flags: rest };
}

type CourseCommand = (
  courseRoot: string,
  workspaceRoot: string,
  flags: string[],
) => number | Promise<number>;

const COURSE_COMMANDS: Record<string, CourseCommand> = {
  dev: async (courseRoot, workspaceRoot) =>
    (await import('./build-commands.js')).runDev(courseRoot, workspaceRoot),
  export: async (courseRoot, workspaceRoot) =>
    (await import('./build-commands.js')).runBuild(courseRoot, workspaceRoot),
  validate: (courseRoot) => runValidate(courseRoot),
  a11y: (courseRoot, workspaceRoot, flags) =>
    runA11y(courseRoot, workspaceRoot, flags),
  check: (courseRoot, workspaceRoot, flags) => {
    const validateCode = runValidate(courseRoot, { showA11yTip: false });
    if (validateCode !== 0) return validateCode;
    return runA11y(courseRoot, workspaceRoot, flags);
  },
};

export async function main(
  argv: string[],
  cwd: string = process.cwd(),
): Promise<number> {
  const [sub, ...rest] = argv;

  if (sub === 'new') return runNew(rest[0], cwd);
  if (sub === 'duplicate') return runDuplicate(rest[0], rest[1], cwd);

  if (sub !== undefined && Object.hasOwn(COURSE_COMMANDS, sub)) {
    if (rest.includes('--help') || rest.includes('-h')) {
      console.log(USAGE);
      return 0;
    }
    const { course, flags } = splitCourseArg(rest);
    const resolved = resolveCourse(cwd, course);
    if (!resolved.ok) {
      console.error(`[tessera] ${resolved.error}`);
      return 1;
    }
    return COURSE_COMMANDS[sub](
      resolved.courseRoot,
      resolved.workspaceRoot,
      flags,
    );
  }

  if (sub === '--help' || sub === '-h') {
    console.log(USAGE);
    return 0;
  }
  if (sub === undefined) {
    console.error(`No command given.\n\n${USAGE}`);
    return 1;
  }
  console.error(`Unknown command: ${sub}\n\n${USAGE}`);
  return 1;
}

// import.meta.main is true only when this module is the program entry point,
// and resolves symlinks itself (pnpm/npm bin shims) — Node >= 24.
if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
