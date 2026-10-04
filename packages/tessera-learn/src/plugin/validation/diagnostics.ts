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
