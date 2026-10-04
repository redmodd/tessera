import { isRecord, oneOf } from '../../runtime/types.js';
import type { ReadFailure } from '../manifest.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  infos?: string[];
}

/** Collects diagnostics so checkers thread one argument, not three. */
export class Diagnostics implements ValidationResult {
  errors: string[] = [];
  warnings: string[] = [];
  infos: string[] = [];
  error(message: string): void {
    this.errors.push(message);
  }
  warn(message: string): void {
    this.warnings.push(message);
  }
  info(message: string): void {
    this.infos.push(message);
  }
}

export function describeType(raw: unknown): string {
  return raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
}

const OR_LIST = new Intl.ListFormat('en', { type: 'disjunction' });

export function quoteList(values: readonly string[]): string {
  return OR_LIST.format(values.map((v) => JSON.stringify(v)));
}

export function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `[${value.map(formatValue).join(',')}]`;
  if (isRecord(value)) {
    const entries = Object.entries(value).map(
      ([k, v]) => `${JSON.stringify(k)}:${formatValue(v)}`,
    );
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

export function oneOfError(
  field: string,
  values: readonly string[],
  value: unknown,
  note = '',
): string {
  return `${field} must be ${quoteList(values)}${note}, got ${formatValue(value)}`;
}

export function checkOneOf(
  field: string,
  values: readonly string[],
  value: unknown,
  d: Diagnostics,
): void {
  if (value !== undefined && !oneOf(values, value)) {
    d.error(oneOfError(field, values, value));
  }
}

export const STATIC_LITERAL_RULE =
  'must be a static object literal (no variables, function calls, or computed values)';

export const READ_FAILURE_MESSAGES: Record<ReadFailure['reason'], string> = {
  missing: 'not found',
  'parse-error': 'could not parse, JavaScript syntax error',
  'no-export': 'must use `export default { ... }` syntax',
  'not-data': `the default export ${STATIC_LITERAL_RULE}`,
};
