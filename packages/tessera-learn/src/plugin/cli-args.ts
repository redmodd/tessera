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
  {
    options = {},
    maxPositionals = Infinity,
  }: { options?: ParseArgsOptionsConfig; maxPositionals?: number } = {},
): CliArgs {
  let parsed;
  try {
    parsed = parseArgs({ args, options, allowPositionals: true });
  } catch (error) {
    const { code, message } = error as Error & { code?: string };
    // Node follows an unknown option with a hint on passing it after `--`.
    return { error: message.replace(/\. To specify .*$/s, ''), code };
  }
  const extra = parsed.positionals[maxPositionals];
  if (extra !== undefined) return { error: `Unexpected argument: ${extra}` };
  return parsed;
}

export function styleErr(
  format: Parameters<typeof styleText>[0],
  text: string,
): string {
  return styleText(format, text, { stream: process.stderr });
}
