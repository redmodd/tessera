import { runAudit, type AuditOptions, type ImpactLevel } from './a11y/audit.js';

const VALID_THRESHOLDS: ImpactLevel[] = [
  'minor',
  'moderate',
  'serious',
  'critical',
];

export type ParsedA11yArgs =
  | { ok: true; args: AuditOptions }
  | { ok: false; error: string };

export function parseA11yArgs(argv: string[]): ParsedA11yArgs {
  let threshold: ImpactLevel | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--threshold') {
      const value = argv[++i] as ImpactLevel;
      if (!VALID_THRESHOLDS.includes(value)) {
        return {
          ok: false,
          error: `--threshold must be one of: ${VALID_THRESHOLDS.join(', ')}`,
        };
      }
      threshold = value;
    } else {
      return { ok: false, error: `Unknown argument: ${arg}` };
    }
  }

  const args: AuditOptions = {};
  if (threshold !== undefined) args.threshold = threshold;
  return { ok: true, args };
}

export async function runA11y(
  projectRoot: string,
  workspaceRoot: string,
  argv: string[],
): Promise<number> {
  const parsed = parseA11yArgs(argv);
  if (!parsed.ok) {
    console.error(`[tessera a11y] ${parsed.error}`);
    return 1;
  }
  return runAudit(projectRoot, workspaceRoot, parsed.args);
}
