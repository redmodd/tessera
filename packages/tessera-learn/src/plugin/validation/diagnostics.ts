import { oneOf } from '../../runtime/types.js';

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
  return typeof value === 'number' ? String(value) : JSON.stringify(value);
}

export function checkOneOf(
  field: string,
  values: readonly string[],
  value: unknown,
  d: Diagnostics,
): void {
  if (value !== undefined && !oneOf(values, value)) {
    d.error(`${field} must be ${quoteList(values)}, got ${formatValue(value)}`);
  }
}
