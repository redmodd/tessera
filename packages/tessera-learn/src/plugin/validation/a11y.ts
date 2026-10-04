import { readCourseConfig } from '../manifest.js';
import {
  A11Y_LEVELS,
  A11Y_STANDARDS,
  isRecord,
  oneOf,
  type A11yConfig,
} from '../../runtime/types.js';
import type { Diagnostics } from './diagnostics.js';

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

export type A11ySettings = Required<A11yConfig>;

/** Normalize the raw `a11y` config to defaults, ignoring malformed pieces. */
export function normalizeA11y(raw: unknown): A11ySettings {
  const a11y = isRecord(raw) ? raw : {};
  const level = oneOf(A11Y_LEVELS, a11y.level) ? a11y.level : 'warn';
  const standard = oneOf(A11Y_STANDARDS, a11y.standard)
    ? a11y.standard
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
