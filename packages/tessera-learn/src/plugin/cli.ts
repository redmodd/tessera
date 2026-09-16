#!/usr/bin/env node
import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';
import { runValidate } from './validate-cli.js';
import { IMPACT_LEVELS, runAudit, type ImpactLevel } from './a11y/audit.js';
import { runNew } from './new-cli.js';
import { runDuplicate } from './duplicate-cli.js';
import { resolveCourse, type ResolvedCourse } from './course-root.js';
import { STANDARD_IDS, type StandardId } from '../runtime/standards.js';

interface Flag<T extends string = string> {
  name: string;
  choices: readonly T[];
  description: string;
}

const STANDARD_FLAG: Flag<StandardId> = {
  name: 'standard',
  choices: STANDARD_IDS,
  description: 'Override course.config.js export.standard',
};

const THRESHOLD_FLAG: Flag<ImpactLevel> = {
  name: 'threshold',
  choices: IMPACT_LEVELS,
  description: 'Failing impact (default: serious)',
};

type Command = {
  args: string[];
  summary: string;
} & (
  | {
      course: false;
      flag?: never;
      run(positionals: string[], cwd: string): number;
    }
  | {
      course: true;
      flag?: Flag;
      run(
        course: ResolvedCourse,
        flagValue: string | undefined,
      ): number | Promise<number>;
    }
);

function courseCommand<T extends string>(command: {
  args: string[];
  summary: string;
  flag?: Flag<T>;
  run(
    course: ResolvedCourse,
    flagValue: T | undefined,
  ): number | Promise<number>;
}): Command {
  return { course: true, ...command };
}

const COMMANDS: Record<string, Command> = {
  new: {
    course: false,
    args: ['<name>'],
    summary: 'Scaffold a new course into courses/<name>',
    run: ([name], cwd) => runNew(name, cwd),
  },
  duplicate: {
    course: false,
    args: ['<source>', '<new>'],
    summary: 'Copy courses/<source> to courses/<new>',
    run: ([source, target], cwd) => runDuplicate(source, target, cwd),
  },
  dev: courseCommand({
    args: ['[course]'],
    summary: 'Start the Vite dev server',
    run: async ({ courseRoot, workspaceRoot }) =>
      (await import('./build-commands.js')).runDev(courseRoot, workspaceRoot),
  }),
  export: courseCommand({
    args: ['[course]'],
    summary: 'Build and package the course for its LMS standard',
    flag: STANDARD_FLAG,
    run: async ({ courseRoot, workspaceRoot }, standard) =>
      (await import('./build-commands.js')).runBuild(
        courseRoot,
        workspaceRoot,
        standard,
      ),
  }),
  validate: courseCommand({
    args: ['[course]'],
    summary: 'Fast static structure checks',
    flag: STANDARD_FLAG,
    run: ({ courseRoot }, standard) =>
      runValidate(courseRoot, {
        standardOverride: standard,
      }),
  }),
  a11y: courseCommand({
    args: ['[course]'],
    summary: 'Runtime accessibility audit (builds + drives Playwright)',
    flag: THRESHOLD_FLAG,
    run: ({ courseRoot, workspaceRoot }, threshold) =>
      runAudit(courseRoot, workspaceRoot, {
        threshold,
      }),
  }),
  check: courseCommand({
    args: ['[course]'],
    summary: 'Run validate, then a11y',
    flag: THRESHOLD_FLAG,
    run: ({ courseRoot, workspaceRoot }, threshold) => {
      const validateCode = runValidate(courseRoot, { showA11yTip: false });
      if (validateCode !== 0) return validateCode;
      return runAudit(courseRoot, workspaceRoot, {
        threshold,
      });
    },
  }),
};

function formatUsage(): string {
  const entries = Object.entries(COMMANDS);
  const flagUsers = new Map<Flag, string[]>();
  for (const [name, { flag }] of entries) {
    if (flag) flagUsers.set(flag, [...(flagUsers.get(flag) ?? []), name]);
  }
  const commandLines = entries.map(
    ([name, { args, summary }]) =>
      `  ${`${name} ${args.join(' ')}`.padEnd(28)}${summary}`,
  );
  const flagBlocks = [...flagUsers].map(
    ([{ name, choices, description }, users]) =>
      `${users.join('/')} options:\n  ${`--${name} <${choices.join('|')}>`.padEnd(48)}${description}`,
  );
  return [
    'Usage: tessera <command> [course] [options]',
    `Commands:\n${commandLines.join('\n')}`,
    'Run a command from inside a course folder, or name the course explicitly.',
    ...flagBlocks,
  ].join('\n\n');
}

const USAGE = formatUsage();

// Flag values are checked here, before the course resolves, so an unknown
// standard fails before Vite spins up.
function parseCommandArgs(
  { args: synopsis, flag }: { args: string[]; flag?: Flag },
  args: string[],
):
  | { error: string }
  | { help: boolean; positionals: string[]; flagValue?: string } {
  const options: ParseArgsOptionsConfig = {
    help: { type: 'boolean', short: 'h' },
  };
  if (flag) options[flag.name] = { type: 'string' };

  let parsed;
  try {
    parsed = parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    return { error: (error as Error).message };
  }
  const { values, positionals } = parsed;
  if (values.help) return { help: true, positionals };

  if (positionals.length > synopsis.length) {
    return { error: `Unexpected argument: ${positionals[synopsis.length]}` };
  }

  const flagValue = flag ? values[flag.name] : undefined;
  if (!flag || typeof flagValue !== 'string') {
    return { help: false, positionals };
  }
  if (!flag.choices.includes(flagValue)) {
    return {
      error: `--${flag.name} must be one of: ${flag.choices.join(', ')}, got "${flagValue}"`,
    };
  }
  return { help: false, positionals, flagValue };
}

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

  const command = COMMANDS[sub];
  const parsed = parseCommandArgs(command, rest);
  if ('error' in parsed) {
    console.error(`[tessera ${sub}] ${parsed.error}`);
    return 1;
  }
  if (parsed.help) {
    console.log(USAGE);
    return 0;
  }
  if (!command.course) return command.run(parsed.positionals, cwd);

  const resolved = resolveCourse(cwd, parsed.positionals[0]);
  if (!resolved.ok) {
    console.error(`[tessera ${sub}] ${resolved.error}`);
    return 1;
  }
  return command.run(resolved, parsed.flagValue);
}

// import.meta.main is true only when this module is the program entry point,
// and resolves symlinks itself (pnpm/npm bin shims). Requires Node >= 24.
if (import.meta.main) {
  void main(process.argv.slice(2)).then((code) => process.exit(code));
}
