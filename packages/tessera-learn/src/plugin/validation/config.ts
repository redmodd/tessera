import { resolve } from 'node:path';
import { readCourseConfig, readSourceFileCached } from '../manifest.js';
import { defaultExportFunctionPaths } from '../ast.js';
import {
  DEFAULT_STANDARD,
  STANDARD_IDS,
  standardProfile,
  type StandardId,
  type StandardProfile,
} from '../../runtime/standards.js';
import {
  SUCCESS_SOURCES,
  courseIdentity,
  type CourseConfig,
  type ManualCompletion,
  type PercentageCompletion,
} from '../../runtime/types.js';
import { contrastRatio } from '../a11y/contrast.js';
import { isCspOverrides } from '../csp.js';
import {
  A11Y_IDS,
  VALID_A11Y_LEVELS,
  VALID_A11Y_STANDARDS,
  describeType,
  tag,
  type Diagnostics,
} from './diagnostics.js';
import { validateAssetRefs } from './media.js';
import { validateXAPIConfig, type XAPIHookRead } from './xapi.js';

// Known top-level config fields
const KNOWN_CONFIG_FIELDS = new Set([
  'title',
  'id',
  'description',
  'author',
  'version',
  'resume',
  'language',
  'branding',
  'navigation',
  'completion',
  'success',
  'scoring',
  'export',
  'chrome',
  'xapi',
  'a11y',
]);

// Heuristic, not a full BCP-47 grammar: a 2–3 letter primary subtag (any case)
// plus any number of 1–8 alphanumeric subtags (script/region/variant/singleton).
const BCP47_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/;

/** Plausible BCP-47 tag? Shared by the linter and the <html lang> emitter. */
export function isPlausibleLanguageTag(value: unknown): value is string {
  return typeof value === 'string' && BCP47_RE.test(value);
}

const VALID_NAV_MODES = ['free', 'sequential'];
const VALID_COMPLETION_MODES = ['quiz', 'percentage', 'manual'];
const EXPORT_STANDARD_LIST = STANDARD_IDS.map((s) => `"${s}"`).join(', ');
const VALID_MANUAL_TRIGGERS = ['page'];
const VALID_SUCCESS_STATUS = ['passed', 'failed'];
// Derived from the runtime types (single source of truth) — widened to
// string[] so .includes() accepts an arbitrary author-supplied value.
const VALID_SUCCESS_SOURCES: readonly string[] = SUCCESS_SOURCES;

// ---------- Config Validation ----------

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
  runtimeHooks: XAPIHookRead,
  standardOverride?: StandardId,
): { config: ParsedConfig | null; profile: StandardProfile | undefined } {
  const read = readCourseConfig(projectRoot);
  if (!read.ok) {
    // 'missing' can't occur — validateProject checks existsSync first.
    if (read.reason === 'no-export') {
      d.error('course.config.js: must use `export default { ... }` syntax');
    } else if (read.reason === 'parse-error') {
      reportConfigParseError(projectRoot, d);
    }
    return { config: null, profile: undefined };
  }
  const config: ParsedConfig = read.config;

  // Check for unknown fields
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_FIELDS.has(key)) {
      d.warn(`course.config.js: unknown field "${key}" — will be ignored`);
    }
  }

  // Validate title against the runtime merge `userConfig.title || "Untitled
  // Course"`: a missing or empty string falls back to the default (warn), a
  // whitespace-only string is truthy and ships verbatim (warn), and a
  // non-string is a misconfiguration — a truthy one ships as-is, a falsy one
  // falls back, but either way the author should fix it (error).
  if (config.title !== undefined && typeof config.title !== 'string') {
    d.error(
      `course.config.js: "title" must be a string, got ${typeof config.title}`,
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

  // Validate branding
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
        `course.config.js: "language" (${JSON.stringify(config.language)}) is not a plausible BCP-47 tag — use e.g. "en", "es", or "fr-CA"`,
      ),
    );
  }

  // Validate export.standard
  if (config.export?.standard !== undefined) {
    if (!standardProfile(config.export.standard)) {
      d.error(
        `course.config.js: "export.standard" must be one of ${EXPORT_STANDARD_LIST}, got "${config.export.standard}"`,
      );
    }
  }

  // Apply the override after validating the file value above, so every
  // standard-dependent check below (identity, csp, xapi, crossValidate) sees
  // what actually ships.
  if (standardOverride) {
    config.export = { ...config.export, standard: standardOverride };
  }

  // Identity matters for web (storage key) and cmi5/xAPI (LRS activity id);
  // SCORM identity is owned by the LMS, so only nudge for the others.
  const standard = config.export?.standard ?? DEFAULT_STANDARD;
  const profile = standardProfile(standard);
  if (profile && !profile.derivesLearnerActor && !courseIdentity(config)) {
    d.warn(
      `course.config.js: no "id" set, so the ${profile.packaged ? `${profile.name} activity id` : 'web storage key'} falls back to a fixed value that collides across courses. Add a unique id (e.g. "urn:uuid:…"); scaffolded courses include one.`,
    );
  }

  // Validate a11y config block
  if (config.a11y !== undefined) {
    validateA11yConfig(config.a11y, d);
  }

  // Validate navigation.mode
  if (config.navigation?.mode !== undefined) {
    if (!VALID_NAV_MODES.includes(config.navigation.mode)) {
      d.error(
        `course.config.js: "navigation.mode" must be "free" or "sequential", got "${config.navigation.mode}"`,
      );
    }
  }

  // Validate completion.mode
  if (config.completion?.mode !== undefined) {
    if (!VALID_COMPLETION_MODES.includes(config.completion.mode)) {
      d.error(
        `course.config.js: "completion.mode" must be "quiz", "percentage", or "manual", got "${config.completion.mode}"`,
      );
    }
  }

  if (config.completion?.trigger !== undefined) {
    if (config.completion.mode !== 'manual') {
      d.warn(
        `course.config.js: "completion.trigger" is ignored unless completion.mode is "manual"`,
      );
    } else if (!VALID_MANUAL_TRIGGERS.includes(config.completion.trigger)) {
      d.error(
        `course.config.js: "completion.trigger" must be "page" or omitted, got "${config.completion.trigger}"`,
      );
    }
  }

  const success = config.success;
  let successAccepted = false;
  if (success !== undefined) {
    if (!success || typeof success !== 'object' || Array.isArray(success)) {
      d.error(
        `course.config.js: "success" must be an object like { from: "quiz" }`,
      );
    } else if (!VALID_SUCCESS_SOURCES.includes(success.from)) {
      d.error(
        `course.config.js: "success.from" must be "quiz", "fixed", or "none", got "${success.from}"`,
      );
    } else if (
      success.from === 'fixed' &&
      !VALID_SUCCESS_STATUS.includes(success.status as string)
    ) {
      d.error(
        `course.config.js: "success.status" must be "passed" or "failed" under success.from: "fixed", got "${success.status}"`,
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
    if (manual && !VALID_SUCCESS_STATUS.includes(requireStatus)) {
      d.error(
        `course.config.js: "completion.requireSuccessStatus" must be "passed" or "failed" (omit for "unknown"), got "${requireStatus}"`,
      );
    }
  }

  // Validate resume policy
  if (
    config.resume !== undefined &&
    config.resume !== 'auto' &&
    config.resume !== 'never'
  ) {
    d.error(
      `course.config.js: "resume" must be "auto" or "never", got "${config.resume}"`,
    );
  }

  // Validate export.csp (web-only CSP extension)
  if (config.export?.csp !== undefined) {
    const csp = config.export.csp;
    if (csp !== false && !isCspOverrides(csp)) {
      d.warn(
        'course.config.js: "export.csp" must be false or an object of directive → string[]; ignoring it and using the baseline CSP',
      );
    } else if (profile?.packaged) {
      d.warn(
        `course.config.js: "export.csp" is ignored when "export.standard" is "${config.export.standard}" (the CSP meta is web-export only)`,
      );
    }
  }

  validatePercent('scoring.passingScore', config.scoring?.passingScore, d);
  validatePercent(
    'completion.percentageThreshold',
    config.completion?.percentageThreshold,
    d,
  );

  validateXAPIConfig(config.xapi, standard, runtimeHooks, d);

  return { config, profile };
}

function validatePercent(
  key: string,
  value: number | undefined,
  d: Diagnostics,
): void {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    d.error(`course.config.js: "${key}" must be 0–100, got ${value}`);
  }
}

function reportConfigParseError(projectRoot: string, d: Diagnostics): void {
  const source = readSourceFileCached(resolve(projectRoot, 'course.config.js'));
  const paths = defaultExportFunctionPaths(source);
  if (paths.length === 0) {
    d.error('course.config.js: could not parse — JavaScript syntax error');
    return;
  }
  for (const path of paths) {
    d.error(
      `course.config.js: "${path}" is a function, but course.config.js is data only. ` +
        'Export it from course.runtime.js instead (see "Runtime hooks" in the authoring guide).',
    );
  }
}

// ---------- Branding Validation ----------

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
  raw: unknown,
  projectRoot: string,
  d: Diagnostics,
): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    d.warn(
      `course.config.js: "branding" must be an object, got ${describeType(raw)} — will be ignored`,
    );
    return;
  }
  const branding = raw as Record<string, unknown>;

  const logo = branding.logo;
  if (logo !== undefined) {
    if (typeof logo !== 'string') {
      d.warn(
        `course.config.js: "branding.logo" must be a string, got ${typeof logo}`,
      );
    } else {
      validateAssetRefs(
        logo,
        'course.config.js "branding.logo"',
        resolve(projectRoot, 'assets'),
        d,
        new Map(),
      );
    }
  }

  const primaryColor = branding.primaryColor;
  if (primaryColor !== undefined) {
    if (typeof primaryColor !== 'string') {
      d.warn(
        `course.config.js: "branding.primaryColor" must be a string, got ${typeof primaryColor}`,
      );
    } else if (!isPlausibleColor(primaryColor)) {
      d.warn(
        `course.config.js: "branding.primaryColor" "${primaryColor}" does not look like a valid CSS color — the theme will fall back to its default shades if the browser can't parse it`,
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
      `course.config.js: "branding.fontFamily" must be a string, got ${typeof fontFamily}`,
    );
  }
}

// ---------- a11y Config Validation ----------

/** Shape-check the `a11y` block. Malformed values can't be silenced by `ignore`. */
function validateA11yConfig(raw: unknown, d: Diagnostics): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    d.error(
      `course.config.js: "a11y" must be an object, got ${describeType(raw)}`,
    );
    return;
  }
  const a11y = raw as Record<string, unknown>;

  if (
    a11y.level !== undefined &&
    !VALID_A11Y_LEVELS.includes(a11y.level as string)
  ) {
    d.error(
      `course.config.js: "a11y.level" must be "warn" or "error", got ${JSON.stringify(a11y.level)}`,
    );
  }
  if (
    a11y.standard !== undefined &&
    !VALID_A11Y_STANDARDS.includes(a11y.standard as string)
  ) {
    d.error(
      `course.config.js: "a11y.standard" must be "wcag2a", "wcag2aa", or "wcag21aa", got ${JSON.stringify(a11y.standard)}`,
    );
  }
  if (a11y.ignore !== undefined) {
    if (
      !Array.isArray(a11y.ignore) ||
      a11y.ignore.some((x) => typeof x !== 'string')
    ) {
      d.error(
        `course.config.js: "a11y.ignore" must be an array of rule-ID strings`,
      );
    }
  }
}
