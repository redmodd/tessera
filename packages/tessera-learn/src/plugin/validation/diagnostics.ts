import JSON5 from 'json5';
import { oneOf } from '../../runtime/types.js';

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  infos?: string[];
  /** Set when a source could not be read, so the checks that depend on it did not run. */
  partial?: boolean;
}

/** Collects diagnostics so checkers thread one argument, not three. */
export class Diagnostics implements ValidationResult {
  errors: string[] = [];
  warnings: string[] = [];
  infos: string[] = [];
  partial = false;
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
  return JSON5.stringify(value, { quote: '"' }) ?? String(value);
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
