import { parseArgs, styleText, type ParseArgsOptionsConfig } from 'node:util';

export type CliArgs =
  | { error: string; code?: string }
  | {
      values: ReturnType<typeof parseArgs>['values'];
      positionals: string[];
    };

// --help/-h wins over any other argument before the `--` terminator, so
// `--bogus --help` shows help rather than an error.
export function wantsHelp(args: string[]): boolean {
  const end = args.indexOf('--');
  const flags = end === -1 ? args : args.slice(0, end);
  return flags.includes('--help') || flags.includes('-h');
}

export function parseCliArgs(
  args: string[],
  options: ParseArgsOptionsConfig = {},
): CliArgs {
  try {
    return parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    const { code, message } = error as Error & { code?: string };
    // Node follows the error with a hint sentence; keep only the error.
    return { error: message.split('. ')[0], code };
  }
}

export function styleErr(
  format: Parameters<typeof styleText>[0],
  text: string,
): string {
  return styleText(format, text, { stream: process.stderr });
}
