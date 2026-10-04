import JSON5 from 'json5';
import { resolve } from 'node:path';
import {
  OBJECT_CONFIG_SECTIONS,
  readCourseConfig,
  readSourceFileCached,
  resolveConfigRead,
  READ_FAILURE_MESSAGES,
} from '../manifest.js';
import { defaultExportFunctions } from '../ast.js';
import {
  STANDARD_IDS,
  type StandardId,
  type StandardProfile,
} from '../../runtime/standards.js';
import {
  A11Y_LEVELS,
  A11Y_STANDARDS,
  CHROME_MODES,
  NAVIGATION_MODES,
  RESUME_POLICIES,
  SUCCESS_SOURCES,
  VERDICTS,
  courseIdentity,
  isRecord,
  isStringArray,
  oneOf,
  type CourseConfig,
  type ManualCompletion,
  type PercentageCompletion,
} from '../../runtime/types.js';
import { contrastRatio } from '../a11y/contrast.js';
import { isCspOverrides } from '../csp.js';
import { A11Y_IDS, tag } from './a11y.js';
import {
  checkOneOf,
  describeType,
  formatValue,
  oneOfError,
  type Diagnostics,
} from './diagnostics.js';
import { validateAssetRefs } from './media.js';

const KNOWN_CONFIG_FIELDS = new Set(
  Object.keys({
    title: true,
    id: true,
    description: true,
    author: true,
    version: true,
    resume: true,
    language: true,
    branding: true,
    navigation: true,
    completion: true,
    success: true,
    scoring: true,
    export: true,
    chrome: true,
    xapi: true,
    a11y: true,
  } satisfies Record<keyof CourseConfig, true>),
);

// Heuristic, not a full BCP-47 grammar: a 2–3 letter primary subtag (any case)
// plus any number of 1–8 alphanumeric subtags (script/region/variant/singleton).
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

/** Plausible BCP-47 tag? Shared by the linter and the <html lang> emitter. */
export function isPlausibleLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && BCP47_RE.test(value);
}

const COMPLETION_MODES = Object.keys({
  quiz: true,
  percentage: true,
  manual: true,
} satisfies Record<CourseConfig['completion']['mode'], true>);

export type ParsedConfig = Partial<Omit<CourseConfig, 'completion'>> & {
  completion?: Partial<
    Pick<CourseConfig['completion'], 'mode'> &
      Omit<ManualCompletion, 'mode'> &
      Omit<PercentageCompletion, 'mode'>
  >;
};

export function parseConfig(
  projectRoot: string,
  d: Diagnostics,
  standardOverride?: StandardId,
): { config: ParsedConfig | null; profile: StandardProfile | undefined } {
  const read = readCourseConfig(projectRoot);
  const unreadableExport =
    read.ok &&
    !standardOverride &&
    read.config.export !== undefined &&
    !isRecord(read.config.export);
  const profile = unreadableExport
    ? undefined
    : resolveConfigRead(read, standardOverride).profile;
  if (!read.ok) {
    if (read.reason === 'not-data') {
      reportNonDataConfig(projectRoot, d);
    } else {
      d.error(`course.config.js: ${READ_FAILURE_MESSAGES[read.reason]}`);
    }
    return { config: null, profile };
  }
  const config: ParsedConfig = read.config;

  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_FIELDS.has(key)) {
      d.warn(`course.config.js: unknown field "${key}" — will be ignored`);
    }
  }

  for (const key of OBJECT_CONFIG_SECTIONS) {
    if (config[key] !== undefined && !isRecord(config[key])) {
      d.error(
        `course.config.js: "${key}" must be an object, got ${describeType(config[key])}`,
      );
    }
  }

  // Validate title against the runtime merge `userConfig.title || "Untitled
  // Course"`: a missing or empty string falls back to the default (warn), a
  // whitespace-only string is truthy and ships verbatim (warn), and a
  // non-string is a misconfiguration — a truthy one ships as-is, a falsy one
  // falls back, but either way the author should fix it (error).
  if (config.title !== undefined && typeof config.title !== 'string') {
    d.error(
      `course.config.js: "title" must be a string, got ${describeType(config.title)}`,
    );
  } else if (config.title === undefined || config.title === '') {
    d.warn(
      'course.config.js: "title" is missing or empty — the course will ship as "Untitled Course"',
    );
  } else if (config.title.trim() === '') {
    d.warn(
      'course.config.js: "title" is only whitespace — it ships verbatim and will not fall back to "Untitled Course"',
    );
  }

  if (config.branding !== undefined) {
    validateBranding(config.branding, projectRoot, d);
  }

  // Rule 1.8: language present and well-formed (BCP-47)
  if (config.language === undefined) {
    d.warn(
      tag(
        A11Y_IDS.lang,
        `course.config.js: "language" is not set — defaulting <html lang> to "en". Set it to the course's language (BCP-47, e.g. "en", "fr-CA") for WCAG 3.1.1.`,
      ),
    );
  } else if (!isPlausibleLanguageTag(config.language)) {
    d.warn(
      tag(
        A11Y_IDS.lang,
        `course.config.js: "language" (${formatValue(config.language)}) is not a plausible BCP-47 tag — use e.g. "en", "es", or "fr-CA"`,
      ),
    );
  }

  // The file's value, not the override: a --standard run still flags a bad one.
  checkOneOf(
    'course.config.js: "export.standard"',
    STANDARD_IDS,
    config.export?.standard,
    d,
  );

  // Identity matters for web (storage key) and cmi5/xAPI (LRS activity id);
  // SCORM identity is owned by the LMS, so only nudge for the others.
  if (profile && !profile.derivesLearnerActor && !courseIdentity(config)) {
    d.warn(
      `course.config.js: no "id" set, so the ${profile.packaged ? `${profile.name} activity id` : 'web storage key'} falls back to a fixed value that collides across courses. Add a unique id (e.g. "urn:uuid:…"); scaffolded courses include one.`,
    );
  }

  if (config.a11y !== undefined) {
    validateA11yConfig(config.a11y, d);
  }

  checkOneOf(
    'course.config.js: "navigation.mode"',
    NAVIGATION_MODES,
    config.navigation?.mode,
    d,
  );
  checkOneOf(
    'course.config.js: "completion.mode"',
    COMPLETION_MODES,
    config.completion?.mode,
    d,
  );

  if (config.completion?.trigger !== undefined) {
    if (config.completion.mode !== 'manual') {
      d.warn(
        `course.config.js: "completion.trigger" is ignored unless completion.mode is "manual"`,
      );
    } else if (config.completion.trigger !== 'page') {
      d.error(
        oneOfError(
          'course.config.js: "completion.trigger"',
          ['page'],
          config.completion.trigger,
          ' or omitted',
        ),
      );
    }
  }

  const success = config.success;
  let successAccepted = false;
  if (success !== undefined) {
    if (!isRecord(success)) {
      d.error(
        `course.config.js: "success" must be an object like { from: "quiz" }`,
      );
    } else if (!oneOf(SUCCESS_SOURCES, success.from)) {
      d.error(
        oneOfError(
          'course.config.js: "success.from"',
          SUCCESS_SOURCES,
          success.from,
        ),
      );
    } else if (success.from === 'fixed' && !oneOf(VERDICTS, success.status)) {
      d.error(
        oneOfError(
          'course.config.js: "success.status"',
          VERDICTS,
          success.status,
          ' under success.from: "fixed"',
        ),
      );
    } else {
      successAccepted = true;
      if (success.from !== 'fixed' && success.status !== undefined) {
        d.warn(
          `course.config.js: "success.status" is ignored unless success.from is "fixed"`,
        );
      }
    }
  }

  const requireStatus = config.completion?.requireSuccessStatus;
  if (requireStatus !== undefined) {
    const manual = config.completion?.mode === 'manual';
    if (successAccepted) {
      d.warn(
        'course.config.js: "completion.requireSuccessStatus" is ignored when "success" is set, which takes precedence',
      );
    } else if (!manual) {
      d.warn(
        `course.config.js: "completion.requireSuccessStatus" is ignored unless completion.mode is "manual"`,
      );
    }
    if (manual && !oneOf(VERDICTS, requireStatus)) {
      d.error(
        oneOfError(
          'course.config.js: "completion.requireSuccessStatus"',
          VERDICTS,
          requireStatus,
          ' (omit for "unknown")',
        ),
      );
    }
  }

  checkOneOf('course.config.js: "chrome"', CHROME_MODES, config.chrome, d);
  checkOneOf('course.config.js: "resume"', RESUME_POLICIES, config.resume, d);

  if (config.export?.csp !== undefined) {
    const csp = config.export.csp;
    if (csp !== false && !isCspOverrides(csp)) {
      d.warn(
        'course.config.js: "export.csp" must be false or an object of directive → string[]; ignoring it and using the baseline CSP',
      );
    } else if (profile?.packaged) {
      d.warn(
        `course.config.js: "export.csp" is ignored when "export.standard" is "${profile.id}" (the CSP meta is web-export only)`,
      );
    }
  }

  validatePercent('scoring.passingScore', config.scoring?.passingScore, d);
  validatePercent(
    'completion.percentageThreshold',
    config.completion?.percentageThreshold,
    d,
  );

  return { config, profile };
}

function validatePercent(
  key: string,
  value: number | undefined,
  d: Diagnostics,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    d.error(
      `course.config.js: "${key}" must be 0–100, got ${formatValue(value)}`,
    );
  }
}

function reportNonDataConfig(projectRoot: string, d: Diagnostics): void {
  const source = readSourceFileCached(resolve(projectRoot, 'course.config.js'));
  const { paths, rest } = defaultExportFunctions(source);
  for (const path of paths) {
    d.error(
      `course.config.js: "${path}" is a function, but course.config.js is data only. ` +
        'Export it from course.runtime.js instead (see "Runtime hooks" in the authoring guide).',
    );
  }
  if (!isJson5(rest)) {
    d.error(`course.config.js: ${READ_FAILURE_MESSAGES['not-data']}`);
  }
}

function isJson5(text: string | null): boolean {
  if (text === null) return false;
  try {
    JSON5.parse(text);
    return true;
  } catch {
    return false;
  }
}

// Permissive approximation of the browser's accepted color set: hex 3/4/6/8,
// any CSS functional notation (rgb/hsl/hwb/lab/lch/oklab/oklch/color), or a
// bare keyword (named colors, transparent, currentColor). parseColor's real
// check (App.svelte) is browser-only and the runtime degrades gracefully, so
// an unrecognized value is advisory, never an error — lean permissive to avoid
// rejecting values the browser would accept.
const HEX_COLOR_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const FUNC_COLOR_RE =
  /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(.*\)$/i;
const NAMED_COLOR_RE = /^[a-zA-Z]+$/;

function isPlausibleColor(value: string): boolean {
  const v = value.trim();
  return (
    HEX_COLOR_RE.test(v) || FUNC_COLOR_RE.test(v) || NAMED_COLOR_RE.test(v)
  );
}

/**
 * Format checks on the branding block (advisory) plus rule 1.7's contrast check
 * on primaryColor. Runtime failures are mild: an unresolved logo ships a broken
 * <img src>, an unparseable color falls back to theme defaults.
 */
function validateBranding(
  branding: unknown,
  projectRoot: string,
  d: Diagnostics,
): void {
  if (!isRecord(branding)) {
    d.warn(
      `course.config.js: "branding" must be an object, got ${describeType(branding)} — will be ignored`,
    );
    return;
  }

  const logo = branding.logo;
  if (logo !== undefined) {
    if (typeof logo !== 'string') {
      d.warn(
        `course.config.js: "branding.logo" must be a string, got ${describeType(logo)}`,
      );
    } else {
      validateAssetRefs(
        logo,
        'course.config.js "branding.logo"',
        resolve(projectRoot, 'assets'),
        d,
      );
    }
  }

  const primaryColor = branding.primaryColor;
  if (primaryColor !== undefined) {
    if (typeof primaryColor !== 'string') {
      d.warn(
        `course.config.js: "branding.primaryColor" must be a string, got ${describeType(primaryColor)}`,
      );
    } else if (!isPlausibleColor(primaryColor)) {
      d.warn(
        `course.config.js: "branding.primaryColor" ${formatValue(primaryColor)} does not look like a valid CSS color — the theme will fall back to its default shades if the browser can't parse it`,
      );
    } else {
      // Rule 1.7: primaryColor is used both as links on the default white page
      // background and as a button fill behind white text — symmetric, so one
      // ratio covers both. Non-#hex valid colors return null and defer to Tier 2.
      const ratio = contrastRatio(primaryColor, '#ffffff');
      if (ratio !== null && ratio < 4.5) {
        d.warn(
          tag(
            A11Y_IDS.primaryContrast,
            `course.config.js: branding.primaryColor (${primaryColor}) is ${ratio.toFixed(2)}:1 against white — it's used both for links on the page background and as a button fill behind white text, and WCAG AA needs 4.5:1 for each`,
          ),
        );
      }
    }
  }

  const fontFamily = branding.fontFamily;
  if (fontFamily !== undefined && typeof fontFamily !== 'string') {
    d.warn(
      `course.config.js: "branding.fontFamily" must be a string, got ${describeType(fontFamily)}`,
    );
  }
}

/** Shape-check the `a11y` block. Malformed values can't be silenced by `ignore`. */
function validateA11yConfig(a11y: unknown, d: Diagnostics): void {
  if (!isRecord(a11y)) {
    d.error(
      `course.config.js: "a11y" must be an object, got ${describeType(a11y)}`,
    );
    return;
  }

  checkOneOf('course.config.js: "a11y.level"', A11Y_LEVELS, a11y.level, d);
  checkOneOf(
    'course.config.js: "a11y.standard"',
    A11Y_STANDARDS,
    a11y.standard,
    d,
  );
  if (a11y.ignore !== undefined && !isStringArray(a11y.ignore)) {
    d.error(
      `course.config.js: "a11y.ignore" must be an array of rule-ID strings`,
    );
  }
}
