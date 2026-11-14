import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

export type CliArgs =
  | { help: true }
  | { error: string; code?: string }
  | {
      help: false;
      values: Record<
        string,
        string | boolean | (string | boolean)[] | undefined
      >;
      positionals: string[];
    };

// --help/-h wins over any other argument before the `--` terminator, so
// `--bogus --help` shows help rather than an error.
export function parseCliArgs(
  args: string[],
  options: ParseArgsOptionsConfig = {},
): CliArgs {
  const end = args.indexOf('--');
  const flags = end === -1 ? args : args.slice(0, end);
  if (flags.includes('--help') || flags.includes('-h')) return { help: true };

  try {
    const { values, positionals } = parseArgs({
      args,
      options,
      allowPositionals: true,
    });
    return { help: false, values, positionals };
  } catch (error) {
    const { code, message } = error as Error & { code?: string };
    // Node follows the error with a hint sentence; keep only the error.
    return { error: message.split('. ')[0], code };
  }
}
