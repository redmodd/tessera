import JSON5 from 'json5';
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
  /** Set when the config, the runtime file or the export standard could not be read, so a check on any source may have been skipped. */
  partial = false;
  /** Set when a page could not be parsed, so the checks on the course as a whole skipped what needs every page. */
  courseChecksSkipped = false;
  #source: string | undefined;
  #prefix = '';
  #sources = new Map<string, string>();

  error(message: string): void {
    this.#add(this.errors, message);
  }
  warn(message: string): void {
    this.#add(this.warnings, message);
  }
  info(message: string): void {
    this.#add(this.infos, message);
  }

  #add(list: string[], message: string): void {
    // After a leading a11y rule tag, which `a11y.ignore` matches at the start.
    message = message.replace(/^(\[[^\]]+\] )?/, `$1${this.#prefix}`);
    list.push(message);
    if (this.#source !== undefined) this.#sources.set(message, this.#source);
  }

  /**
   * Run the checks of one source file or folder, so what they raise is known to
   * be about it. With `prefix`, each message they raise starts with `source: `.
   */
  within<T>(source: string, check: () => T, { prefix = false } = {}): T {
    const outer = [this.#source, this.#prefix] as const;
    this.#source = source;
    this.#prefix = prefix ? `${source}: ` : '';
    try {
      return check();
    } finally {
      [this.#source, this.#prefix] = outer;
    }
  }

  /** The source file or folder a diagnostic was raised for, or undefined for one about the course as a whole. */
  sourceOf(message: string): string | undefined {
    return this.#sources.get(message);
  }

  /**
   * Whether a warning or note an earlier run raised for `source` may still
   * stand though this run did not repeat it. An error on a source can end
   * its checks early.
   */
  mayStand(source: string | undefined): boolean {
    if (this.partial) return true;
    return source === undefined
      ? this.courseChecksSkipped
      : this.errors.some((error) => this.sourceOf(error) === source);
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
