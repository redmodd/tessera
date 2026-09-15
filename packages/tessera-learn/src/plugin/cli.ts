#!/usr/bin/env node
import { runValidate } from './validate-cli.js';
import { parseA11yArgs, VALID_THRESHOLDS } from './a11y-cli.js';
import { runAudit } from './a11y/audit.js';
import { runNew } from './new-cli.js';
import { runDuplicate } from './duplicate-cli.js';
import { resolveCourse } from './course-root.js';
import {
  STANDARD_IDS,
  standardProfile,
  type StandardId,
} from '../runtime/standards.js';

export type ParsedFlags<F> = F | { error: string };

interface Course {
  courseRoot: string;
  workspaceRoot: string;
}

interface CommandInfo {
  args: string;
  summary: string;
  options?: string;
}

interface WorkspaceCommand extends CommandInfo {
  course: false;
  run(args: string[], cwd: string): number;
}

interface CourseCommand<F> extends CommandInfo {
  course: true;
  parseFlags?(flags: string[]): ParsedFlags<F>;
  run(course: Course, flags: F): number | Promise<number>;
}

type Command = WorkspaceCommand | CourseCommand<unknown>;

function courseCommand<F>(
  command: Omit<CourseCommand<F>, 'course'>,
): CourseCommand<unknown> {
  return { ...command, course: true };
}

// Validate here, against the standards table, so an unknown standard
// fails before Vite spins up.
export function parseExportFlags(
  flags: string[],
): ParsedFlags<{ standardOverride?: StandardId }> {
  let standardOverride: StandardId | undefined;
  for (let i = 0; i < flags.length; i++) {
    const arg = flags[i];
    let value: string | undefined;
    if (arg === '--standard') {
      value = flags[++i];
    } else if (arg.startsWith('--standard=')) {
      value = arg.slice('--standard='.length);
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
    if (value === undefined || value.startsWith('-')) {
      return { error: '--standard requires a value' };
    }
    const profile = standardProfile(value);
    if (!profile) {
      return {
        error: `--standard must be one of ${STANDARD_IDS.join(', ')}, got "${value}"`,
      };
    }
    standardOverride = profile.id;
  }
  return standardOverride ? { standardOverride } : {};
}

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

const STANDARD_OPTION = `  --standard <${STANDARD_IDS.join('|')}>    Override course.config.js export.standard`;
const THRESHOLD_OPTION = `  --threshold <${VALID_THRESHOLDS.join('|')}>   Failing impact (default: serious)`;

export const COMMANDS: Record<string, Command> = {
  new: {
    course: false,
    args: '<name>',
    summary: 'Scaffold a new course into courses/<name>',
    run: (args, cwd) => runNew(args[0], cwd),
  },
  duplicate: {
    course: false,
    args: '<source> <new>',
    summary: 'Copy courses/<source> to courses/<new>',
    run: (args, cwd) => runDuplicate(args[0], args[1], cwd),
  },
  dev: courseCommand({
    args: '[course]',
    summary: 'Start the Vite dev server',
    run: async ({ courseRoot, workspaceRoot }) =>
      (await import('./build-commands.js')).runDev(courseRoot, workspaceRoot),
  }),
  export: courseCommand({
    args: '[course]',
    summary: 'Build and package the course for its LMS standard',
    options: STANDARD_OPTION,
    parseFlags: parseExportFlags,
    run: async ({ courseRoot, workspaceRoot }, { standardOverride }) =>
      (await import('./build-commands.js')).runBuild(
        courseRoot,
        workspaceRoot,
        standardOverride,
      ),
  }),
  validate: courseCommand({
    args: '[course]',
    summary: 'Fast static structure checks',
    options: STANDARD_OPTION,
    parseFlags: parseExportFlags,
    run: ({ courseRoot }, { standardOverride }) =>
      runValidate(courseRoot, { standardOverride }),
  }),
  a11y: courseCommand({
    args: '[course]',
    summary: 'Runtime accessibility audit (builds + drives Playwright)',
    options: THRESHOLD_OPTION,
    parseFlags: parseA11yArgs,
    run: ({ courseRoot, workspaceRoot }, options) =>
      runAudit(courseRoot, workspaceRoot, options),
  }),
  check: courseCommand({
    args: '[course]',
    summary: 'Run validate, then a11y',
    options: THRESHOLD_OPTION,
    parseFlags: parseA11yArgs,
    run: ({ courseRoot, workspaceRoot }, options) => {
      const validateCode = runValidate(courseRoot, { showA11yTip: false });
      if (validateCode !== 0) return validateCode;
      return runAudit(courseRoot, workspaceRoot, options);
    },
  }),
};

function formatUsage(commands: Record<string, Command>): string {
  const entries = Object.entries(commands);
  const commandLines = entries.map(
    ([name, { args, summary }]) =>
      `  ${`${name} ${args}`.padEnd(28)}${summary}`,
  );
  const optionUsers = new Map<string, string[]>();
  for (const [name, { options }] of entries) {
    if (options)
      optionUsers.set(options, [...(optionUsers.get(options) ?? []), name]);
  }
  const optionBlocks = [...optionUsers].map(
    ([options, names]) => `${names.join('/')} options:\n${options}`,
  );
  return [
    'Usage: tessera <command> [course] [options]',
    `Commands:\n${commandLines.join('\n')}`,
    'Run a command from inside a course folder, or name the course explicitly.',
    ...optionBlocks,
  ].join('\n\n');
}

export const USAGE = formatUsage(COMMANDS);

export async function main(
  argv: string[],
  cwd: string = process.cwd(),
): Promise<number> {
  const [sub, ...rest] = argv;

  if (sub === '--help' || sub === '-h') {
    console.log(USAGE);
    return 0;
  }
  if (sub === undefined) {
    console.error(`No command given.\n\n${USAGE}`);
    return 1;
  }
  if (!Object.hasOwn(COMMANDS, sub)) {
    console.error(`Unknown command: ${sub}\n\n${USAGE}`);
    return 1;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    console.log(USAGE);
    return 0;
  }

  const command = COMMANDS[sub];
  if (!command.course) return command.run(rest, cwd);

  const { course, flags } = splitCourseArg(rest);
  const parsed = command.parseFlags ? command.parseFlags(flags) : flags;
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    console.error(`[tessera ${sub}] ${parsed.error}`);
    return 1;
  }
  const resolved = resolveCourse(cwd, course);
  if (!resolved.ok) {
    console.error(`[tessera] ${resolved.error}`);
    return 1;
  }
  return command.run(resolved, parsed);
}

// import.meta.main is true only when this module is the program entry point,
// and resolves symlinks itself (pnpm/npm bin shims) — Node >= 24.
if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
