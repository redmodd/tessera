import type { AuditOptions, ImpactLevel } from './a11y/audit.js';
import type { ParsedFlags } from './cli.js';

export const VALID_THRESHOLDS: ImpactLevel[] = [
  'minor',
  'moderate',
  'serious',
  'critical',
];

export function parseA11yArgs(argv: string[]): ParsedFlags<AuditOptions> {
  let threshold: ImpactLevel | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--threshold') {
      const value = argv[++i] as ImpactLevel;
      if (!VALID_THRESHOLDS.includes(value)) {
        return {
          error: `--threshold must be one of: ${VALID_THRESHOLDS.join(', ')}`,
        };
      }
      threshold = value;
    } else {
      return { error: `Unknown argument: ${arg}` };
    }
  }

  return threshold !== undefined ? { threshold } : {};
}
