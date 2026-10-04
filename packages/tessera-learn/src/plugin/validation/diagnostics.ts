import { readCourseConfig } from '../manifest.js';

// ---------- Types ----------

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

// ---------- A11y rule IDs ----------

/** Tier-1b rule IDs. `a11y.ignore` matches these literally. */
export const A11Y_IDS = {
  imageAlt: 'tessera/image-alt',
  mediaTitle: 'tessera/media-title',
  mediaTranscript: 'tessera/media-transcript',
  mediaCaptions: 'tessera/media-captions',
  questionLabel: 'tessera/question-label',
  headingOrder: 'tessera/heading-order',
  primaryContrast: 'tessera/primary-contrast',
  lang: 'tessera/lang',
} as const;

/** Promotable by `a11y.level: 'error'`; the rest are hard contract errors. */
const PROMOTABLE_A11Y_IDS = new Set<string>([
  A11Y_IDS.mediaTranscript,
  A11Y_IDS.mediaCaptions,
  A11Y_IDS.questionLabel,
  A11Y_IDS.headingOrder,
  A11Y_IDS.primaryContrast,
  A11Y_IDS.lang,
]);

/** Prefix a diagnostic with its rule ID so `a11y.ignore` / `level` can match it. */
export function tag(id: string, message: string): string {
  return `[${id}] ${message}`;
}

function diagnosticId(message: string): string | null {
  const m = /^\[([^\]]+)\] /.exec(message);
  return m ? m[1] : null;
}

/** True when a tagged diagnostic's rule ID is in the ignore set. */
export function isIgnored(
  message: string,
  ignore: ReadonlySet<string>,
): boolean {
  const id = diagnosticId(message);
  return id !== null && ignore.has(id);
}

export interface A11ySettings {
  level: 'warn' | 'error';
  standard: 'wcag2a' | 'wcag2aa' | 'wcag21aa';
  ignore: string[];
}

export const VALID_A11Y_LEVELS = ['warn', 'error'];
export const VALID_A11Y_STANDARDS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

/** Normalize the raw `a11y` config to defaults, ignoring malformed pieces. */
export function normalizeA11y(raw: unknown): A11ySettings {
  const a11y =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const level = a11y.level === 'error' ? 'error' : 'warn';
  const standard = VALID_A11Y_STANDARDS.includes(a11y.standard as string)
    ? (a11y.standard as A11ySettings['standard'])
    : 'wcag2aa';
  const ignore = Array.isArray(a11y.ignore)
    ? a11y.ignore.filter((x): x is string => typeof x === 'string')
    : [];
  return { level, standard, ignore };
}

export function readA11ySettings(projectRoot: string): A11ySettings {
  const read = readCourseConfig(projectRoot);
  return normalizeA11y(read.ok ? read.config.a11y : undefined);
}

/**
 * Apply `a11y.ignore` (drop tagged diagnostics) and `a11y.level` (promote the
 * promotable a11y warnings to errors) to a result in place. `ignore` suppresses
 * at any severity, including hard contract errors; `level` only re-rates.
 */
export function applyA11ySettings(
  d: Diagnostics,
  settings: A11ySettings,
): void {
  if (settings.ignore.length > 0) {
    const ignored = new Set(settings.ignore);
    const keep = (msg: string) => !isIgnored(msg, ignored);
    d.errors = d.errors.filter(keep);
    d.warnings = d.warnings.filter(keep);
  }
  if (settings.level === 'error') {
    const remaining: string[] = [];
    for (const msg of d.warnings) {
      const id = diagnosticId(msg);
      if (id !== null && PROMOTABLE_A11Y_IDS.has(id)) d.error(msg);
      else remaining.push(msg);
    }
    d.warnings = remaining;
  }
}

export function describeType(raw: unknown): string {
  return raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
}
