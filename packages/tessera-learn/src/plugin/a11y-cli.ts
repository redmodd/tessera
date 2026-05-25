#!/usr/bin/env node
import { runAudit, type ImpactLevel } from './a11y/audit.js';

const VALID_THRESHOLDS: ImpactLevel[] = [
  'minor',
  'moderate',
  'serious',
  'critical',
];

const args = process.argv.slice(2);
let threshold: ImpactLevel | undefined;
let rebuild = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--threshold') {
    const value = args[++i] as ImpactLevel;
    if (!VALID_THRESHOLDS.includes(value)) {
      console.error(
        `[tessera a11y] --threshold must be one of: ${VALID_THRESHOLDS.join(', ')}`,
      );
      process.exit(1);
    }
    threshold = value;
  } else if (arg === '--build') {
    rebuild = true;
  } else {
    console.error(`[tessera a11y] Unknown argument: ${arg}`);
    process.exit(1);
  }
}

const code = await runAudit(process.cwd(), { threshold, rebuild });
process.exit(code);
