import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import JSON5 from 'json5';
import {
  extractDefaultExportObjectLiteral,
  extractObjectLiteral,
  parsePageConfigFromSource,
  readSourceFileCached,
  ensureSvelteSuffix,
  readCourseConfig,
} from './manifest.js';
import {
  validateAgent,
  validateAuthCredential,
  joinFieldError,
} from '../runtime/xapi/agent-rules.js';
import { shortIdentifier } from '../runtime/interaction-format.js';
import { FEEDBACK_MODES, RETRY_MODES } from '../runtime/types.js';
import { contrastRatio } from './a11y/contrast.js';
import { isVideoEmbed } from '../components/video-embed.js';

// ---------- Types ----------

export interface ValidationResult {
  errors: string[];
  warnings: string[];
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
function tag(id: string, message: string): string {
  return `[${id}] ${message}`;
}

function diagnosticId(message: string): string | null {
  const m = /^\[([^\]]+)\] /.exec(message);
  return m ? m[1] : null;
}

export interface A11ySettings {
  level: 'warn' | 'error';
  standard: 'wcag2a' | 'wcag2aa' | 'wcag21aa';
  ignore: string[];
}

const VALID_A11Y_LEVELS = ['warn', 'error'];
const VALID_A11Y_STANDARDS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

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

/**
 * Apply `a11y.ignore` (drop tagged diagnostics) and `a11y.level` (promote the
 * promotable a11y warnings to errors) to a result in place. `ignore` suppresses
 * at any severity, including hard contract errors; `level` only re-rates.
 */
export function applyA11ySettings(
  result: ValidationResult,
  settings: A11ySettings,
): void {
  if (settings.ignore.length > 0) {
    const ignored = new Set(settings.ignore);
    const keep = (msg: string) => {
      const id = diagnosticId(msg);
      return !(id !== null && ignored.has(id));
    };
    result.errors = result.errors.filter(keep);
    result.warnings = result.warnings.filter(keep);
  }
  if (settings.level === 'error') {
    const remaining: string[] = [];
    for (const msg of result.warnings) {
      const id = diagnosticId(msg);
      if (id !== null && PROMOTABLE_A11Y_IDS.has(id)) result.errors.push(msg);
      else remaining.push(msg);
    }
    result.warnings = remaining;
  }
}

/** Print validation warnings (yellow) then errors (red). Shared by the dev/build plugin and the CLI. */
export function reportValidationIssues({
  errors,
  warnings,
}: ValidationResult): void {
  for (const warning of warnings) {
    console.warn(`\x1b[33m[tessera warning]\x1b[0m ${warning}`);
  }
  for (const error of errors) {
    console.error(`\x1b[31m[tessera error]\x1b[0m ${error}`);
  }
}

// Known top-level config fields
const KNOWN_CONFIG_FIELDS = new Set([
  'title',
  'description',
  'author',
  'version',
  'language',
  'branding',
  'navigation',
  'completion',
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
const VALID_EXPORT_STANDARDS = ['web', 'scorm12', 'scorm2004', 'cmi5'];
const VALID_MANUAL_TRIGGERS = ['page'];
const VALID_REQUIRE_SUCCESS_STATUS = ['passed', 'failed'];
// Derived from the runtime types (single source of truth) — widened to
// string[] so .includes() accepts an arbitrary author-supplied value.
const VALID_FEEDBACK_MODES: readonly string[] = FEEDBACK_MODES;
const VALID_RETRY_MODES: readonly string[] = RETRY_MODES;

// ---------- Main ----------

/**
 * Validate a Tessera project at the given root.
 * Returns errors (block build) and warnings (informational).
 */
export function validateProject(projectRoot: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check course.config.js exists
  const configPath = resolve(projectRoot, 'course.config.js');
  if (!existsSync(configPath)) {
    errors.push('course.config.js not found in project root');
    return { errors, warnings };
  }

  // 2. Parse and validate config
  const config = parseConfig(projectRoot, errors, warnings);

  // 3. Validate pages directory
  const pagesDir = resolve(projectRoot, 'pages');
  const assetsDir = resolve(projectRoot, 'assets');
  const pageResults = validatePages(
    pagesDir,
    assetsDir,
    projectRoot,
    config?.export?.standard,
  );
  errors.push(...pageResults.errors);
  warnings.push(...pageResults.warnings);

  // 4. Contract-bypass checks on project-root shell files
  for (const shellFile of ['layout.svelte', 'quiz.svelte']) {
    const shellPath = resolve(projectRoot, shellFile);
    if (existsSync(shellPath)) {
      validateContractBypass(
        readSourceFileCached(shellPath),
        shellFile,
        errors,
      );
    }
  }

  // 5. Cross-cutting validations
  if (config) {
    crossValidate(config, pageResults, errors, warnings);
  }

  const result: ValidationResult = { errors, warnings };
  applyA11ySettings(result, normalizeA11y(config?.a11y));
  return result;
}

// ---------- Config Validation ----------

interface ParsedConfig {
  title?: string;
  navigation?: { mode?: string };
  completion?: {
    mode?: string;
    percentageThreshold?: number;
    trigger?: string;
    requireSuccessStatus?: string;
  };
  scoring?: { passingScore?: number };
  export?: { standard?: string };
  [key: string]: unknown;
}

function parseConfig(
  projectRoot: string,
  errors: string[],
  warnings: string[],
): ParsedConfig | null {
  const read = readCourseConfig(projectRoot);
  if (!read.ok) {
    // 'missing' can't occur — validateProject checks existsSync first.
    if (read.reason === 'no-export') {
      errors.push(
        'course.config.js: could not parse — must use `export default { ... }` syntax',
      );
    } else if (read.reason === 'parse-error') {
      errors.push(
        'course.config.js: syntax error — must export a static object literal',
      );
    }
    return null;
  }
  const config = read.config as ParsedConfig;

  // Check for unknown fields
  for (const key of Object.keys(config)) {
    if (!KNOWN_CONFIG_FIELDS.has(key)) {
      warnings.push(
        `course.config.js: unknown field "${key}" — will be ignored`,
      );
    }
  }

  // Validate title against the runtime merge `userConfig.title || "Untitled
  // Course"`: a missing or empty string falls back to the default (warn), a
  // whitespace-only string is truthy and ships verbatim (warn), and a
  // non-string is a misconfiguration — a truthy one ships as-is, a falsy one
  // falls back, but either way the author should fix it (error).
  if (config.title !== undefined && typeof config.title !== 'string') {
    errors.push(
      `course.config.js: "title" must be a string, got ${typeof config.title}`,
    );
  } else if (config.title === undefined || config.title === '') {
    warnings.push(
      'course.config.js: "title" is missing or empty — the course will ship as "Untitled Course"',
    );
  } else if (config.title.trim() === '') {
    warnings.push(
      'course.config.js: "title" is only whitespace — it ships verbatim and will not fall back to "Untitled Course"',
    );
  }

  // Validate branding
  if (config.branding !== undefined) {
    validateBranding(config.branding, warnings);
  }

  // Rule 1.8: language present and well-formed (BCP-47)
  if (config.language === undefined) {
    warnings.push(
      tag(
        A11Y_IDS.lang,
        `course.config.js: "language" is not set — defaulting <html lang> to "en". Set it to the course's language (BCP-47, e.g. "en", "fr-CA") for WCAG 3.1.1.`,
      ),
    );
  } else if (!isPlausibleLanguageTag(config.language)) {
    warnings.push(
      tag(
        A11Y_IDS.lang,
        `course.config.js: "language" (${JSON.stringify(config.language)}) is not a plausible BCP-47 tag — use e.g. "en", "es", or "fr-CA"`,
      ),
    );
  }

  // Validate a11y config block
  if (config.a11y !== undefined) {
    validateA11yConfig(config.a11y, errors);
  }

  // Validate navigation.mode
  if (config.navigation?.mode !== undefined) {
    if (!VALID_NAV_MODES.includes(config.navigation.mode)) {
      errors.push(
        `course.config.js: "navigation.mode" must be "free" or "sequential", got "${config.navigation.mode}"`,
      );
    }
  }

  // Validate completion.mode
  if (config.completion?.mode !== undefined) {
    if (!VALID_COMPLETION_MODES.includes(config.completion.mode)) {
      errors.push(
        `course.config.js: "completion.mode" must be "quiz", "percentage", or "manual", got "${config.completion.mode}"`,
      );
    }
  }

  if (config.completion?.trigger !== undefined) {
    if (config.completion.mode !== 'manual') {
      warnings.push(
        `course.config.js: "completion.trigger" is ignored unless completion.mode is "manual"`,
      );
    } else if (!VALID_MANUAL_TRIGGERS.includes(config.completion.trigger)) {
      errors.push(
        `course.config.js: "completion.trigger" must be "page" or omitted, got "${config.completion.trigger}"`,
      );
    }
  }

  if (config.completion?.requireSuccessStatus !== undefined) {
    if (config.completion.mode !== 'manual') {
      warnings.push(
        `course.config.js: "completion.requireSuccessStatus" is ignored unless completion.mode is "manual"`,
      );
    } else if (
      !VALID_REQUIRE_SUCCESS_STATUS.includes(
        config.completion.requireSuccessStatus,
      )
    ) {
      errors.push(
        `course.config.js: "completion.requireSuccessStatus" must be "passed" or "failed" (omit for "unknown"), got "${config.completion.requireSuccessStatus}"`,
      );
    }
  }

  // Validate export.standard
  if (config.export?.standard !== undefined) {
    if (!VALID_EXPORT_STANDARDS.includes(config.export.standard)) {
      errors.push(
        `course.config.js: "export.standard" must be "web", "scorm12", "scorm2004", or "cmi5", got "${config.export.standard}"`,
      );
    }
  }

  // Validate scoring.passingScore
  if (config.scoring?.passingScore !== undefined) {
    const score = config.scoring.passingScore;
    if (typeof score !== 'number' || score < 0 || score > 100) {
      errors.push(
        `course.config.js: "scoring.passingScore" must be 0–100, got ${score}`,
      );
    }
  }

  // Validate completion.percentageThreshold
  if (config.completion?.percentageThreshold !== undefined) {
    const threshold = config.completion.percentageThreshold;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
      errors.push(
        `course.config.js: "completion.percentageThreshold" must be 0–100, got ${threshold}`,
      );
    }
  }

  // Validate xapi (publisher destinations)
  if (config.xapi !== undefined) {
    validateXAPIConfig(
      config.xapi,
      config.export?.standard ?? 'web',
      errors,
      warnings,
    );
  }

  return config;
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
function validateBranding(raw: unknown, warnings: string[]): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    warnings.push(
      `course.config.js: "branding" must be an object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw} — will be ignored`,
    );
    return;
  }
  const branding = raw as Record<string, unknown>;

  const logo = branding.logo;
  if (logo !== undefined) {
    if (typeof logo !== 'string') {
      warnings.push(
        `course.config.js: "branding.logo" must be a string, got ${typeof logo}`,
      );
    } else if (logo.startsWith('$assets/')) {
      warnings.push(
        'course.config.js: "branding.logo" starts with "$assets/", but branding paths are not asset-resolved — it will ship as a literal, broken src. Use a URL or a path relative to the deployed root.',
      );
    }
  }

  const primaryColor = branding.primaryColor;
  if (primaryColor !== undefined) {
    if (typeof primaryColor !== 'string') {
      warnings.push(
        `course.config.js: "branding.primaryColor" must be a string, got ${typeof primaryColor}`,
      );
    } else if (!isPlausibleColor(primaryColor)) {
      warnings.push(
        `course.config.js: "branding.primaryColor" "${primaryColor}" does not look like a valid CSS color — the theme will fall back to its default shades if the browser can't parse it`,
      );
    } else {
      // Rule 1.7: primaryColor is used both as links on the default white page
      // background and as a button fill behind white text — symmetric, so one
      // ratio covers both. Non-#hex valid colors return null and defer to Tier 2.
      const ratio = contrastRatio(primaryColor, '#ffffff');
      if (ratio !== null && ratio < 4.5) {
        warnings.push(
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
    warnings.push(
      `course.config.js: "branding.fontFamily" must be a string, got ${typeof fontFamily}`,
    );
  }
}

// ---------- a11y Config Validation ----------

/** Shape-check the `a11y` block. Malformed values can't be silenced by `ignore`. */
function validateA11yConfig(raw: unknown, errors: string[]): void {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    errors.push(
      `course.config.js: "a11y" must be an object, got ${raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw}`,
    );
    return;
  }
  const a11y = raw as Record<string, unknown>;

  if (
    a11y.level !== undefined &&
    !VALID_A11Y_LEVELS.includes(a11y.level as string)
  ) {
    errors.push(
      `course.config.js: "a11y.level" must be "warn" or "error", got ${JSON.stringify(a11y.level)}`,
    );
  }
  if (
    a11y.standard !== undefined &&
    !VALID_A11Y_STANDARDS.includes(a11y.standard as string)
  ) {
    errors.push(
      `course.config.js: "a11y.standard" must be "wcag2a", "wcag2aa", or "wcag21aa", got ${JSON.stringify(a11y.standard)}`,
    );
  }
  if (a11y.ignore !== undefined) {
    if (
      !Array.isArray(a11y.ignore) ||
      a11y.ignore.some((x) => typeof x !== 'string')
    ) {
      errors.push(
        `course.config.js: "a11y.ignore" must be an array of rule-ID strings`,
      );
    }
  }
}

// ---------- xAPI Config Validation ----------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateXAPIConfig(
  raw: unknown,
  standard: string,
  errors: string[],
  warnings: string[],
): void {
  if (raw === undefined || raw === null) return;

  // Normalize to array form. The single-object case is shorthand for a
  // one-element array — same machinery, no special case in the runtime.
  const entries: unknown[] = Array.isArray(raw) ? raw : [raw];

  if (Array.isArray(raw)) {
    if (entries.length === 0) {
      errors.push(
        'course.config.js: xapi must contain at least one destination, or be omitted',
      );
      return;
    }
    // At most one 'lms' entry — more than one is never legitimate.
    const lmsCount = entries.filter(
      (e) =>
        e &&
        typeof e === 'object' &&
        (e as { endpoint?: unknown }).endpoint === 'lms',
    ).length;
    if (lmsCount > 1) {
      errors.push(
        "course.config.js: xapi has multiple entries with endpoint: 'lms' — only one cmi5 launch-inherited destination is allowed",
      );
    }
    // Warn on duplicate explicit endpoints.
    const seen = new Map<string, number>();
    for (const e of entries) {
      if (e && typeof e === 'object') {
        const ep = (e as { endpoint?: unknown }).endpoint;
        if (typeof ep === 'string' && ep !== 'lms') {
          seen.set(ep, (seen.get(ep) ?? 0) + 1);
        }
      }
    }
    for (const [ep, count] of seen) {
      if (count > 1) {
        warnings.push(
          `course.config.js: xapi has ${count} entries with endpoint "${ep}" — usually a copy-paste mistake; ` +
            'fan-out to the same LRS with different actors/activityIds is supported but uncommon.',
        );
      }
    }
  } else if (typeof raw !== 'object') {
    errors.push(
      'course.config.js: xapi must be an object or an array of objects',
    );
    return;
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = Array.isArray(raw) ? `xapi[${i}]` : 'xapi';
    if (!entry || typeof entry !== 'object') {
      errors.push(`course.config.js: ${label} must be an object`);
      continue;
    }
    validateSingleXAPIEntry(
      entry as Record<string, unknown>,
      label,
      standard,
      errors,
      warnings,
    );
  }
}

function validateSingleXAPIEntry(
  entry: Record<string, unknown>,
  label: string,
  standard: string,
  errors: string[],
  warnings: string[],
): void {
  const endpoint = entry.endpoint;
  if (endpoint === undefined) {
    errors.push(`course.config.js: ${label}.endpoint is required`);
    return;
  }
  if (typeof endpoint !== 'string') {
    errors.push(`course.config.js: ${label}.endpoint must be a string`);
    return;
  }

  if (endpoint === 'lms') {
    // Forbid under non-cmi5 export.
    if (standard !== 'cmi5') {
      errors.push(
        `course.config.js: ${label}.endpoint: 'lms' requires export.standard: 'cmi5' (you have "${standard}"). ` +
          'Either change the export standard or specify an explicit LRS endpoint.',
      );
    }
    // Forbid extra fields — everything is inherited from the cmi5 launch.
    const forbidden = [
      'auth',
      'actor',
      'activityId',
      'registration',
      'actorAccountHomePage',
    ];
    for (const f of forbidden) {
      if (entry[f] !== undefined) {
        errors.push(
          `course.config.js: ${label}.${f} must be omitted when ${label}.endpoint is 'lms' — it is inherited from the cmi5 launch.`,
        );
      }
    }
    return;
  }

  // Explicit endpoint — must be an absolute http(s) URL.
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    errors.push(
      `course.config.js: ${label}.endpoint must be an absolute http(s) URL, got "${endpoint}"`,
    );
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    errors.push(
      `course.config.js: ${label}.endpoint must use http: or https:, got "${url.protocol}"`,
    );
    return;
  }
  if (url.protocol === 'http:' && process.env.NODE_ENV === 'production') {
    warnings.push(
      `course.config.js: ${label}.endpoint uses http:; LRS credentials will travel in cleartext. Use https in production.`,
    );
  }
  if (!endpoint.endsWith('/')) {
    warnings.push(
      `course.config.js: ${label}.endpoint should end with a slash to avoid concatenation surprises ` +
        `(e.g. 'https://lrs.example.com/xapi/' not 'https://lrs.example.com/xapi'). Runtime normalizes regardless.`,
    );
  }

  // auth — required for explicit endpoints.
  const auth = entry.auth;
  if (auth === undefined) {
    errors.push(`course.config.js: ${label}.auth is required`);
  } else if (typeof auth === 'string') {
    const authErr = validateAuthCredential(auth);
    if (authErr) {
      errors.push(
        `course.config.js: ${joinFieldError(`${label}.auth`, authErr)}`,
      );
    } else {
      warnings.push(
        `course.config.js: ${label}.auth is a static string and will be embedded in the bundle. ` +
          'For production, pass a function that fetches a short-lived token from a server endpoint.',
      );
    }
  } else if (typeof auth !== 'function') {
    errors.push(
      `course.config.js: ${label}.auth must be a string or a function, got ${typeof auth}`,
    );
  }

  // activityId — required IRI.
  const activityId = entry.activityId;
  if (activityId === undefined || activityId === '') {
    errors.push(`course.config.js: ${label}.activityId is required`);
  } else if (typeof activityId !== 'string') {
    errors.push(`course.config.js: ${label}.activityId must be a string`);
  } else {
    try {
      // Any absolute IRI — the URL constructor accepts uncommon schemes.
      new URL(activityId);
    } catch {
      errors.push(
        `course.config.js: ${label}.activityId must be an absolute IRI, got "${activityId}"`,
      );
    }
  }

  // actor — required under web; optional otherwise.
  const actor = entry.actor;
  if (actor === undefined) {
    if (standard === 'web') {
      errors.push(
        `course.config.js: ${label}.actor is required for web export — there is no LMS to derive a learner identity from. ` +
          'Provide either a static actor object or a function that resolves one (e.g. from your auth system).',
      );
    }
  } else if (typeof actor === 'object' && actor !== null) {
    const err = validateAgent(actor);
    if (err) {
      errors.push(`course.config.js: ${joinFieldError(`${label}.actor`, err)}`);
    }
  } else if (typeof actor !== 'function') {
    errors.push(
      `course.config.js: ${label}.actor must be an object or function, got ${typeof actor}`,
    );
  }

  // actorAccountHomePage — optional, only meaningful under SCORM with no
  // explicit actor.
  const aahp = entry.actorAccountHomePage;
  if (aahp !== undefined) {
    if (typeof aahp !== 'string') {
      errors.push(
        `course.config.js: ${label}.actorAccountHomePage must be a string`,
      );
    } else {
      try {
        new URL(aahp);
      } catch {
        errors.push(
          `course.config.js: ${label}.actorAccountHomePage must be an absolute URL`,
        );
      }
    }
    if (actor !== undefined) {
      warnings.push(
        `course.config.js: ${label}.actorAccountHomePage is ignored when ${label}.actor is supplied explicitly.`,
      );
    }
    if (standard === 'cmi5' || standard === 'web') {
      warnings.push(
        `course.config.js: ${label}.actorAccountHomePage is only used under scorm12/scorm2004 actor synthesis; ignored under "${standard}".`,
      );
    }
  }

  // SCORM with auto-derived actor and a non-http(s) activityId:
  // actorAccountHomePage becomes required.
  if (
    actor === undefined &&
    (standard === 'scorm12' || standard === 'scorm2004') &&
    typeof activityId === 'string'
  ) {
    let isHttp: boolean;
    try {
      const u = new URL(activityId);
      isHttp = u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      isHttp = false;
    }
    if (!isHttp && aahp === undefined) {
      errors.push(
        `course.config.js: ${label}.activityId is not an http(s) URL, so its origin can't be used as the SCORM actor's account.homePage. ` +
          `Provide ${label}.actorAccountHomePage explicitly.`,
      );
    }
  }

  // registration — optional UUID v4.
  const registration = entry.registration;
  if (registration !== undefined) {
    if (typeof registration !== 'string' || !UUID_RE.test(registration)) {
      errors.push(
        `course.config.js: ${label}.registration must be a UUID v4, got "${String(registration)}"`,
      );
    }
    if (standard !== 'cmi5') {
      warnings.push(
        `course.config.js: ${label}.registration is a cmi5 concept; the LRS will accept it under "${standard}" but most analytics tools won't know what to do with it.`,
      );
    }
  }
}

// ---------- Pages Validation ----------

interface PageInfo {
  fileRel: string;
  navIndex: number;
  hasGradedQuiz: boolean;
  hasQuiz: boolean;
  completesOnView: boolean;
}

interface PagesValidationResult extends ValidationResult {
  totalPages: number;
  totalQuizzes: number;
  hasGradedQuiz: boolean;
  pages: PageInfo[];
}

/**
 * Validate a single page .svelte file. Used for both section-level (flat) and
 * lesson-level pages — the validation is identical, only the containing
 * directory differs.
 */
function validatePageFile(
  filePath: string,
  projectRoot: string,
  assetsDir: string,
  navIndex: number,
  errors: string[],
  warnings: string[],
  assetExistsCache: Map<string, boolean>,
  exportStandard?: string,
): { page: PageInfo; isQuiz: boolean; isGradedQuiz: boolean } {
  const fileRel = relative(projectRoot, filePath);
  const content = readSourceFileCached(filePath);

  const pageConfig = validatePageConfig(content, fileRel, errors);

  const isQuiz = !!pageConfig?.quiz;
  let isGradedQuiz = false;
  if (pageConfig?.quiz) {
    validateQuizConfig(pageConfig.quiz, fileRel, errors);
    if ((pageConfig.quiz as { graded?: unknown }).graded === true) {
      isGradedQuiz = true;
    }
  }

  const completesOnView = validateCompletesOn(pageConfig, fileRel, errors);

  validateAssetRefs(content, fileRel, assetsDir, warnings, assetExistsCache);
  validateQuestionComponents(
    content,
    fileRel,
    errors,
    warnings,
    exportStandard,
  );
  validateMediaComponents(content, fileRel, errors, warnings);
  validateHeadingOrder(content, fileRel, warnings);
  validateContractBypass(content, fileRel, errors);
  if (
    pageConfig?.quiz &&
    !HAS_USE_QUESTION_RE.test(content) &&
    !HAS_QUESTION_TAG_RE.test(content) &&
    !HAS_LOCAL_SVELTE_IMPORT_RE.test(content)
  ) {
    warnings.push(
      `${fileRel}: quiz page has no question components or useQuestion() calls — ` +
        `the quiz will have nothing to score`,
    );
  }

  return {
    page: {
      fileRel,
      navIndex,
      hasGradedQuiz: isGradedQuiz,
      hasQuiz: isQuiz,
      completesOnView,
    },
    isQuiz,
    isGradedQuiz,
  };
}

function validatePages(
  pagesDir: string,
  assetsDir: string,
  projectRoot: string,
  exportStandard?: string,
): PagesValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pages: PageInfo[] = [];
  let totalPages = 0;
  let totalQuizzes = 0;
  let hasGradedQuiz = false;
  // One existsSync per unique asset for the whole pass.
  const assetExistsCache = new Map<string, boolean>();

  if (!existsSync(pagesDir)) {
    errors.push(
      'No pages found. Create at least one section with a lesson and page in pages/',
    );
    return {
      errors,
      warnings,
      totalPages: 0,
      totalQuizzes: 0,
      hasGradedQuiz: false,
      pages,
    };
  }

  const topLevelEntries = readdirSync(pagesDir);

  // Check for stray .svelte files at pages/ root
  for (const entry of topLevelEntries) {
    const fullPath = resolve(pagesDir, entry);
    if (entry.endsWith('.svelte') && statSync(fullPath).isFile()) {
      const relPath = relative(projectRoot, fullPath);
      warnings.push(
        `${relPath}: this file is outside the section/lesson structure and will be ignored`,
      );
    }
  }

  // Get section directories
  const sectionDirs = topLevelEntries
    .filter((name) => {
      const full = resolve(pagesDir, name);
      return statSync(full).isDirectory() && !name.startsWith('.');
    })
    .sort();

  if (sectionDirs.length === 0) {
    errors.push(
      'No pages found. Create at least one section with a lesson and page in pages/',
    );
    return {
      errors,
      warnings,
      totalPages: 0,
      totalQuizzes: 0,
      hasGradedQuiz: false,
      pages,
    };
  }

  for (const sectionName of sectionDirs) {
    const sectionPath = resolve(pagesDir, sectionName);
    const sectionRel = relative(projectRoot, sectionPath);
    const pagesBeforeSection = totalPages;

    // Validate section _meta.js
    const sectionMeta = validateMetaFile(
      resolve(sectionPath, '_meta.js'),
      sectionRel,
      errors,
    );

    // Flat mode: .svelte files directly at section level are pages of an
    // implicit single lesson. Validate them just like lesson-level pages.
    const sectionEntries = readdirSync(sectionPath);
    const sectionSvelteFiles = sectionEntries
      .filter((name) => {
        const full = resolve(sectionPath, name);
        return name.endsWith('.svelte') && statSync(full).isFile();
      })
      .sort();

    if (sectionMeta?.pages) {
      for (const pageName of sectionMeta.pages) {
        const fileName = ensureSvelteSuffix(pageName);
        if (!sectionSvelteFiles.includes(fileName)) {
          const metaRel = relative(
            projectRoot,
            resolve(sectionPath, '_meta.js'),
          );
          errors.push(
            `${metaRel}: pages array lists "${pageName}" but ${fileName} not found in this directory`,
          );
        }
      }
    }

    for (const fileName of sectionSvelteFiles) {
      const result = validatePageFile(
        resolve(sectionPath, fileName),
        projectRoot,
        assetsDir,
        totalPages,
        errors,
        warnings,
        assetExistsCache,
        exportStandard,
      );
      totalPages++;
      if (result.isQuiz) totalQuizzes++;
      if (result.isGradedQuiz) hasGradedQuiz = true;
      pages.push(result.page);
    }

    // Get lesson directories
    const lessonDirs = sectionEntries
      .filter((name) => {
        const full = resolve(sectionPath, name);
        return statSync(full).isDirectory() && !name.startsWith('.');
      })
      .sort();

    for (const lessonName of lessonDirs) {
      const lessonPath = resolve(sectionPath, lessonName);
      const lessonRel = relative(projectRoot, lessonPath);

      // Validate lesson _meta.js
      const meta = validateMetaFile(
        resolve(lessonPath, '_meta.js'),
        lessonRel,
        errors,
      );

      // Get .svelte files
      const svelteFiles = readdirSync(lessonPath)
        .filter((name) => name.endsWith('.svelte'))
        .sort();

      // Check pages array references
      if (meta?.pages) {
        for (const pageName of meta.pages) {
          const fileName = ensureSvelteSuffix(pageName);
          if (!svelteFiles.includes(fileName)) {
            const metaRel = relative(
              projectRoot,
              resolve(lessonPath, '_meta.js'),
            );
            errors.push(
              `${metaRel}: pages array lists "${pageName}" but ${fileName} not found in this directory`,
            );
          }
        }
      }

      // Check for unlisted .svelte files
      if (meta?.pages && meta.pages.length > 0) {
        const listedSet = new Set(meta.pages.map(ensureSvelteSuffix));
        for (const file of svelteFiles) {
          if (!listedSet.has(file)) {
            const relPath = relative(projectRoot, resolve(lessonPath, file));
            warnings.push(
              `${relPath}: not listed in _meta.js pages array — will be appended at end`,
            );
          }
        }
      }

      // Validate each .svelte file
      for (const fileName of svelteFiles) {
        const result = validatePageFile(
          resolve(lessonPath, fileName),
          projectRoot,
          assetsDir,
          totalPages,
          errors,
          warnings,
          assetExistsCache,
          exportStandard,
        );
        totalPages++;
        if (result.isQuiz) totalQuizzes++;
        if (result.isGradedQuiz) hasGradedQuiz = true;
        pages.push(result.page);
      }
    }

    // The page-count delta covers both the no-lessons and empty-lessons cases.
    if (totalPages === pagesBeforeSection) {
      warnings.push(
        `${sectionRel}: section contributed no pages and will be empty`,
      );
    }
  }

  if (totalPages === 0) {
    errors.push(
      'No pages found. Create at least one section with a lesson and page in pages/',
    );
  }

  return { errors, warnings, totalPages, totalQuizzes, hasGradedQuiz, pages };
}

// ---------- _meta.js Validation ----------

function validateMetaFile(
  metaPath: string,
  parentRel: string,
  errors: string[],
): { title?: string; pages?: string[] } | null {
  if (!existsSync(metaPath)) return null;

  const metaRel = `${parentRel}/_meta.js`;
  const objectStr = extractDefaultExportObjectLiteral(
    readSourceFileCached(metaPath),
  );

  if (!objectStr) {
    errors.push(
      `${metaRel}: syntax error — must export default { title: "..." }`,
    );
    return null;
  }

  let meta: { title?: string; pages?: string[] };
  try {
    meta = JSON5.parse(objectStr);
  } catch {
    errors.push(
      `${metaRel}: syntax error — must export default { title: "..." }`,
    );
    return null;
  }

  if (!meta.title) {
    errors.push(`${metaRel}: missing required "title" field`);
  }

  return meta;
}

// ---------- pageConfig Validation ----------

function validatePageConfig(
  content: string,
  fileRel: string,
  errors: string[],
): { title?: string; quiz?: unknown; completesOn?: unknown } | null {
  const result = parsePageConfigFromSource(content);
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'invalid') {
    errors.push(
      `${fileRel}: pageConfig must be a static object literal (no variables, function calls, or computed values)`,
    );
  }
  return null;
}

function validateCompletesOn(
  pageConfig: { completesOn?: unknown } | null,
  fileRel: string,
  errors: string[],
): boolean {
  if (!pageConfig || pageConfig.completesOn === undefined) return false;
  if (pageConfig.completesOn === 'view') return true;
  errors.push(
    `${fileRel}: pageConfig.completesOn must be "view", got ${JSON.stringify(pageConfig.completesOn)}`,
  );
  return false;
}

// ---------- Quiz Config Validation ----------

function validateQuizConfig(
  quiz: unknown,
  fileRel: string,
  errors: string[],
): void {
  if (!quiz || typeof quiz !== 'object') return;
  const cfg = quiz as Record<string, unknown>;

  if (cfg.maxAttempts !== undefined) {
    const val = cfg.maxAttempts;
    if (
      val !== Infinity &&
      (typeof val !== 'number' || val <= 0 || !Number.isFinite(val))
    ) {
      errors.push(
        `${fileRel}: quiz.maxAttempts must be a positive number or Infinity, got ${String(val)}`,
      );
    }
  }

  for (const field of ['graded', 'gatesProgress']) {
    if (cfg[field] !== undefined && typeof cfg[field] !== 'boolean') {
      errors.push(
        `${fileRel}: quiz.${field} must be a boolean, got ${typeof cfg[field]}`,
      );
    }
  }

  if (
    cfg.feedbackMode !== undefined &&
    !VALID_FEEDBACK_MODES.includes(cfg.feedbackMode as string)
  ) {
    errors.push(
      `${fileRel}: quiz.feedbackMode must be "review", "immediate", or "never", got "${String(cfg.feedbackMode)}"`,
    );
  }
  if (
    cfg.retryMode !== undefined &&
    !VALID_RETRY_MODES.includes(cfg.retryMode as string)
  ) {
    errors.push(
      `${fileRel}: quiz.retryMode must be "full" or "incorrect-only", got "${String(cfg.retryMode)}"`,
    );
  }
}

// ---------- Question Component Validation ----------

const QUESTION_COMPONENT_REQUIRED: Record<string, string[]> = {
  MultipleChoice: ['question', 'options', 'correct'],
  FillInTheBlank: ['question', 'answers'],
  Matching: ['question', 'pairs'],
  Sorting: ['question', 'items', 'targets', 'correct'],
};

type PropValue =
  | { kind: 'string'; value: string }
  | { kind: 'expr'; raw: string }
  | { kind: 'bool' };

/**
 * Parse the props of an opening tag starting just after the component name.
 * Returns null if the tag can't be parsed cleanly — callers then skip it
 * rather than risk a false positive.
 */
function parseTagProps(
  content: string,
  start: number,
): Map<string, PropValue> | null {
  const props = new Map<string, PropValue>();
  let i = start;
  while (i < content.length) {
    while (i < content.length && /\s/.test(content[i])) i++;
    if (i >= content.length) return null;
    const c = content[i];
    if (c === '>') return props;
    if (c === '/' && content[i + 1] === '>') return props;
    // Spread / shorthand expression — skip the whole {...} block.
    if (c === '{') {
      const block = extractObjectLiteral(content, i);
      if (!block) return null;
      i += block.length;
      continue;
    }
    const nameMatch = /^[A-Za-z_][\w-]*/.exec(content.slice(i));
    if (!nameMatch) return null;
    const propName = nameMatch[0];
    i += propName.length;
    while (i < content.length && /\s/.test(content[i])) i++;
    if (content[i] !== '=') {
      props.set(propName, { kind: 'bool' });
      continue;
    }
    i++;
    while (i < content.length && /\s/.test(content[i])) i++;
    const v = content[i];
    if (v === '"' || v === "'") {
      const end = content.indexOf(v, i + 1);
      if (end === -1) return null;
      props.set(propName, { kind: 'string', value: content.slice(i + 1, end) });
      i = end + 1;
    } else if (v === '{') {
      const block = extractObjectLiteral(content, i);
      if (!block) return null;
      props.set(propName, { kind: 'expr', raw: block.slice(1, -1).trim() });
      i += block.length;
    } else {
      return null;
    }
  }
  return null;
}

function staticArray(prop: PropValue | undefined): unknown[] | null {
  if (prop?.kind !== 'expr' || !prop.raw.startsWith('[')) return null;
  try {
    const parsed = JSON5.parse(prop.raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function staticNumber(prop: PropValue | undefined): number | null {
  if (prop?.kind !== 'expr') return null;
  try {
    const parsed = JSON5.parse(prop.raw);
    return typeof parsed === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

function validateQuestionComponents(
  content: string,
  fileRel: string,
  errors: string[],
  warnings: string[],
  exportStandard?: string,
): void {
  const names = Object.keys(QUESTION_COMPONENT_REQUIRED).join('|');
  const tagStartRe = new RegExp(`<(${names})(?=[\\s/>])`, 'g');
  const seenIds = new Set<string>();
  const seenSanitized = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = tagStartRe.exec(content)) !== null) {
    const name = m[1];
    const props = parseTagProps(content, m.index + m[0].length);
    if (!props) continue;

    for (const req of QUESTION_COMPONENT_REQUIRED[name]) {
      if (!props.has(req)) {
        errors.push(`${fileRel}: <${name}> is missing required prop "${req}"`);
      }
    }

    // Rule 1.5: empty option/answer labels are both an a11y and a scoring bug.
    for (const labelProp of ['options', 'answers']) {
      const entries = staticArray(props.get(labelProp));
      if (entries?.some((e) => typeof e === 'string' && e.trim() === '')) {
        warnings.push(
          tag(
            A11Y_IDS.questionLabel,
            `${fileRel}: <${name}> has an empty ${labelProp === 'options' ? 'option' : 'answer'} label`,
          ),
        );
      }
    }

    const idProp = props.get('id');
    if (idProp?.kind === 'string') {
      if (seenIds.has(idProp.value)) {
        errors.push(
          `${fileRel}: duplicate question id "${idProp.value}" — each question on a page needs a unique id`,
        );
      } else if (exportStandard === 'scorm12') {
        // scorm12-only: shortIdentifier strips non-alphanumerics, so distinct
        // raw ids can collide after sanitization. Skip raw duplicates (already
        // flagged above) to avoid double-reporting the same id.
        const sane = shortIdentifier(idProp.value);
        if (sane !== idProp.value) {
          warnings.push(
            `${fileRel}: question id "${idProp.value}" will be rewritten to "${sane}" for SCORM 1.2 — use only letters and digits (underscores only between them)`,
          );
        }
        if (seenSanitized.has(sane)) {
          errors.push(
            `${fileRel}: question id "${idProp.value}" collides with a prior id after SCORM 1.2 sanitization ("${sane}")`,
          );
        }
        seenSanitized.add(sane);
      }
      seenIds.add(idProp.value);
    }

    const weightProp = props.get('weight');
    if (weightProp?.kind === 'string') {
      warnings.push(
        `${fileRel}: <${name}> weight="${weightProp.value}" is a string and is ignored (treated as 1) — pass a number: weight={${weightProp.value}}`,
      );
    } else {
      const weight = staticNumber(weightProp);
      if (weight !== null) {
        if (!Number.isFinite(weight)) {
          errors.push(
            `${fileRel}: <${name}> weight must be finite — a non-finite weight makes the weighted score NaN, got ${weight}`,
          );
        } else if (!(weight > 0)) {
          warnings.push(
            `${fileRel}: <${name}> weight ${weight} is not positive and is ignored (treated as 1)`,
          );
        }
      }
    }

    if (name === 'MultipleChoice') {
      const options = staticArray(props.get('options'));
      const correct = staticNumber(props.get('correct'));
      if (options && correct !== null) {
        if (
          !Number.isInteger(correct) ||
          correct < 0 ||
          correct >= options.length
        ) {
          errors.push(
            `${fileRel}: <MultipleChoice> correct={${correct}} is out of range for ${options.length} options (valid: 0–${options.length - 1})`,
          );
        }
      }
      const optionFeedback = staticArray(props.get('optionFeedback'));
      if (options && optionFeedback && optionFeedback.length > options.length) {
        warnings.push(
          `${fileRel}: <MultipleChoice> optionFeedback has ${optionFeedback.length} entries but only ${options.length} options — the extra entries can never be shown`,
        );
      }
    } else if (name === 'Sorting') {
      const items = staticArray(props.get('items'));
      const targets = staticArray(props.get('targets'));
      const correct = staticArray(props.get('correct'));
      if (items && correct && correct.length !== items.length) {
        errors.push(
          `${fileRel}: <Sorting> correct has ${correct.length} entries but items has ${items.length} — they must be parallel arrays`,
        );
      }
      if (targets && correct) {
        for (const idx of correct) {
          if (
            typeof idx !== 'number' ||
            !Number.isInteger(idx) ||
            idx < 0 ||
            idx >= targets.length
          ) {
            errors.push(
              `${fileRel}: <Sorting> correct contains ${JSON.stringify(idx)}, out of range for ${targets.length} targets (valid: 0–${targets.length - 1})`,
            );
            break;
          }
        }
      }
    } else if (name === 'Matching') {
      const pairs = staticArray(props.get('pairs'));
      if (pairs) {
        const bad = pairs.some(
          (p) =>
            typeof p !== 'object' ||
            p === null ||
            typeof (p as { left?: unknown }).left !== 'string' ||
            typeof (p as { right?: unknown }).right !== 'string',
        );
        if (bad) {
          errors.push(
            `${fileRel}: <Matching> pairs must be an array of { left: string, right: string } objects`,
          );
        }
      }
    } else if (name === 'FillInTheBlank') {
      const answers = staticArray(props.get('answers'));
      if (answers) {
        if (answers.length === 0) {
          errors.push(`${fileRel}: <FillInTheBlank> answers must not be empty`);
        } else if (answers.some((a) => typeof a !== 'string')) {
          errors.push(
            `${fileRel}: <FillInTheBlank> answers must be an array of strings`,
          );
        }
      }
    }
  }
}

// ---------- Media Component Validation (rules 1.3 / 1.4) ----------

/** Remove HTML/Svelte comments so commented-out markup isn't scanned as live. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/**
 * Sibling to validateQuestionComponents kept out of QUESTION_COMPONENT_REQUIRED
 * so media isn't treated as gradable questions. Declares `warnings` directly.
 * Non-static (kind 'expr') values are skipped, matching the rest of the linter.
 */
function validateMediaComponents(
  content: string,
  fileRel: string,
  errors: string[],
  warnings: string[],
): void {
  const scan = content.replace(HTML_COMMENT_RE, '');
  const tagStartRe = /<(Image|Video|Audio)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = tagStartRe.exec(scan)) !== null) {
    const name = m[1];
    const props = parseTagProps(scan, m.index + m[0].length);
    if (!props) continue;

    if (name === 'Image') {
      const alt = props.get('alt');
      const decorative = props.get('decorative');
      // A string value is truthy at runtime (so decorative="false" hides the
      // image), but the parser sees a string, not a boolean — flag the misuse.
      if (decorative?.kind === 'string') {
        errors.push(
          tag(
            A11Y_IDS.imageAlt,
            `${fileRel}: <Image> "decorative" must be a boolean — use decorative or decorative={true}, not the string ${JSON.stringify(decorative.value)}`,
          ),
        );
        continue;
      }
      const hasDecorative =
        decorative?.kind === 'bool' ||
        (decorative?.kind === 'expr' && decorative.raw.trim() === 'true');
      const altIsEmpty = alt?.kind === 'string' && alt.value.trim() === '';
      if (!hasDecorative && (alt === undefined || altIsEmpty)) {
        errors.push(
          tag(
            A11Y_IDS.imageAlt,
            `${fileRel}: <Image> needs alt text, or mark it decorative={true} if purely ornamental`,
          ),
        );
      }
      if (hasDecorative && alt?.kind === 'string' && alt.value.trim() !== '') {
        warnings.push(
          tag(
            A11Y_IDS.imageAlt,
            `${fileRel}: <Image> is decorative but also has alt text — the alt will be dropped`,
          ),
        );
      }
      continue;
    }

    // Video / Audio
    const title = props.get('title');
    const titleIsEmpty = title?.kind === 'string' && title.value.trim() === '';
    if (title === undefined || titleIsEmpty) {
      errors.push(
        tag(
          A11Y_IDS.mediaTitle,
          `${fileRel}: <${name}> needs a title — it's the accessible name for the player`,
        ),
      );
    }
    const src = props.get('src');
    const isEmbed = src?.kind === 'string' && isVideoEmbed(src.value);
    if (name === 'Video' && isEmbed && props.get('transcript') === undefined) {
      warnings.push(
        tag(
          A11Y_IDS.mediaTranscript,
          `${fileRel}: <Video> embeds can't carry caption tracks — provide a transcript for WCAG 1.2`,
        ),
      );
    }
    if (
      name === 'Video' &&
      src?.kind === 'string' &&
      !isEmbed &&
      props.get('tracks') === undefined &&
      props.get('transcript') === undefined
    ) {
      warnings.push(
        tag(
          A11Y_IDS.mediaCaptions,
          `${fileRel}: native <Video> has no caption tracks or transcript — add tracks={[…]} or a transcript for WCAG 1.2.2`,
        ),
      );
    }
    if (name === 'Audio' && props.get('transcript') === undefined) {
      warnings.push(
        tag(
          A11Y_IDS.mediaTranscript,
          `${fileRel}: <Audio> has no transcript — required for WCAG 1.2.1`,
        ),
      );
    }
  }
}

// ---------- Heading Order Validation (rule 1.6) ----------

/**
 * Warn on a skipped heading level (e.g. h2 → h4). Scripts, styles, and comments
 * are stripped first so string literals, CSS, and commented-out markup can't be
 * miscounted. No "one h1 per page" check — the layout owns the page h1 and child
 * components emit headings a static scan can't see; that belongs to the Tier-2
 * audit.
 */
function validateHeadingOrder(
  content: string,
  fileRel: string,
  warnings: string[],
): void {
  const html = content
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(HTML_COMMENT_RE, '');
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((h) => Number(h[1]));
  let prevSeen: number | null = null;
  for (const level of levels) {
    if (prevSeen !== null && level - prevSeen > 1) {
      warnings.push(
        tag(
          A11Y_IDS.headingOrder,
          `${fileRel}: heading level jumps from h${prevSeen} to h${level} — don't skip levels (WCAG 1.3.1)`,
        ),
      );
    }
    prevSeen = level;
  }
}

// ---------- Contract Bypass Detection ----------

const QUIZ_COMPLETE_DISPATCH_RE =
  /(?:new\s+CustomEvent\s*\(\s*['"]tessera-quiz-complete['"]|dispatchEvent\s*\([\s\S]{0,120}tessera-quiz-complete)/;
const RUNTIME_INTERNAL_IMPORT_RE = /from\s+['"]tessera-learn\/runtime\//;
const HAS_USE_QUESTION_RE = /\buseQuestion\s*\(/;
const HAS_QUESTION_TAG_RE = new RegExp(
  `<(${Object.keys(QUESTION_COMPONENT_REQUIRED).join('|')})(?=[\\s/>])`,
);
// Custom widget imported from a local `.svelte` file may wrap useQuestion.
// Treat its presence as enough to suppress the "no questions" warning —
// false negatives are acceptable for a heuristic that's already advisory.
const HAS_LOCAL_SVELTE_IMPORT_RE = /from\s+['"][^'"]+\.svelte['"]/;

/**
 * Detect ways an author file can bypass the LMS data contract. These check
 * source text for known escape hatches — they never inspect course content,
 * so they constrain how you wire things up, not what you build.
 */
function validateContractBypass(
  content: string,
  fileRel: string,
  errors: string[],
): void {
  if (QUIZ_COMPLETE_DISPATCH_RE.test(content)) {
    errors.push(
      `${fileRel}: dispatches "tessera-quiz-complete" directly — submit through ` +
        `useQuiz().submit() so the result reaches the LMS`,
    );
  }
  if (RUNTIME_INTERNAL_IMPORT_RE.test(content)) {
    errors.push(
      `${fileRel}: imports from tessera-learn/runtime/* — use the public hooks ` +
        `(useQuiz, useQuestion, useNavigation, …) instead`,
    );
  }
}

// ---------- Asset Reference Validation ----------

const ASSET_REF_RE = /\$assets\/([^\s"'`)]+)/g;

/** Match $assets/... refs in any context (src attrs, import statements, url() etc) and dedupe. */
function collectAssetRefs(content: string): string[] {
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  ASSET_REF_RE.lastIndex = 0;
  while ((match = ASSET_REF_RE.exec(content)) !== null) {
    seen.add(match[1].replace(/[?#].*$/, ''));
  }
  return [...seen];
}

function validateAssetRefs(
  content: string,
  fileRel: string,
  assetsDir: string,
  warnings: string[],
  existsCache: Map<string, boolean>,
): void {
  for (const assetPath of collectAssetRefs(content)) {
    const fullAssetPath = resolve(assetsDir, assetPath);
    let exists = existsCache.get(fullAssetPath);
    if (exists === undefined) {
      exists = existsSync(fullAssetPath);
      existsCache.set(fullAssetPath, exists);
    }
    if (!exists) {
      warnings.push(
        `${fileRel}: "$assets/${assetPath}" not found in assets/ directory`,
      );
    }
  }
}

// ---------- Cross-Cutting Validations ----------

function crossValidate(
  config: ParsedConfig,
  pageResults: PagesValidationResult,
  errors: string[],
  warnings: string[],
): void {
  // completion.mode "quiz" but no graded quizzes
  if (config.completion?.mode === 'quiz' && !pageResults.hasGradedQuiz) {
    errors.push(
      'completion.mode is "quiz" but no pages have quiz config with graded: true',
    );
  }

  // completion.mode "quiz" with an implicit pass threshold — the merge defaults
  // to 70, so this is a nudge, not an error.
  if (
    config.completion?.mode === 'quiz' &&
    config.scoring?.passingScore === undefined
  ) {
    warnings.push(
      'completion.mode is "quiz" but scoring.passingScore is not set — defaulting to 70%. Set it explicitly to be sure.',
    );
  }

  const isManual = config.completion?.mode === 'manual';
  const completesOnPages = pageResults.pages.filter((p) => p.completesOnView);

  if (
    isManual &&
    config.completion?.trigger === 'page' &&
    completesOnPages.length === 0
  ) {
    errors.push(
      'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view". ' +
        'Either add a completesOn page or remove the trigger field to drop the static check.',
    );
  }

  if (isManual) {
    for (const page of pageResults.pages) {
      if (page.hasGradedQuiz) {
        warnings.push(
          `${page.fileRel}: quiz.graded is true under completion.mode: "manual". ` +
            'The score will be reported to the LMS for transcripts, but it will not drive ' +
            "completion or success status — `markComplete()` / completesOn does. If that's " +
            'not what you want, set graded: false or change completion.mode.',
        );
      }
    }
  }

  if (isManual && config.completion?.percentageThreshold !== undefined) {
    warnings.push(
      'course.config.js: "completion.percentageThreshold" is ignored under completion.mode: "manual"',
    );
  }
  if (!isManual) {
    for (const page of completesOnPages) {
      warnings.push(
        `${page.fileRel}: pageConfig.completesOn is ignored — completion.mode is "${config.completion?.mode ?? 'percentage'}"`,
      );
    }
  }
  for (const page of pageResults.pages) {
    if (page.completesOnView && page.hasQuiz) {
      warnings.push(
        `${page.fileRel}: completion fires on view, before the quiz can be answered — likely a mistake`,
      );
    }
  }

  if (isManual) {
    const firstPage = pageResults.pages.find((p) => p.navIndex === 0);
    if (firstPage?.completesOnView) {
      warnings.push(
        `${firstPage.fileRel}: pageConfig.completesOn: "view" is on the first page — the course will complete immediately on launch, before the learner sees any other content.`,
      );
    }
  }

  // SCORM 1.2 + high page count warning
  if (config.export?.standard === 'scorm12') {
    // Estimate worst-case suspend_data size when all pages are visited, all
    // quizzes completed, all chunks revealed, and a modest amount of
    // usePersistence / standalone-question state has accumulated.
    //
    // SavedState shape (see runtime/persistence.ts) — single-letter keys:
    //   b (bookmark), v (visited[]), q (quiz scores), d (duration),
    //   c (chunk progress), s (standalone scores), gs (graded standalone pages),
    //   u (user state from usePersistence)
    //
    // We can't statically detect calls to `useQuestion({ graded: true })` or
    // `usePersistence`, so reserve a fixed buffer per page for those.
    let visitedChars = 0;
    for (let i = 0; i < pageResults.totalPages; i++) {
      visitedChars += String(i).length + 1; // digit chars + comma
    }
    const overhead = 60; // top-level JSON overhead with all keys
    const quizBytes = pageResults.totalQuizzes * 15; // q: "NNN":100,
    const chunkBytes = pageResults.totalPages * 12; // c: "NNN":NN,
    const standaloneBytes = pageResults.totalPages * 30; // s/gs: conservative buffer per page
    const userStateBuffer = 256; // usePersistence headroom
    const estimatedSize =
      overhead +
      visitedChars +
      quizBytes +
      chunkBytes +
      standaloneBytes +
      userStateBuffer;

    if (estimatedSize > 3200) {
      warnings.push(
        `Course has ${pageResults.totalPages} pages with ${pageResults.totalQuizzes} quizzes — estimated SCORM 1.2 suspend_data ~${estimatedSize} bytes may exceed the 4096-byte limit when fully populated (visited + chunks + standalone scores + usePersistence). Consider using "scorm2004" or "cmi5".`,
      );
    }
  }
}
