import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import JSON5 from 'json5';
import {
  extractDefaultExportObjectLiteral,
  parsePageConfigFromSource,
  readSourceFileCached,
  ensureSvelteSuffix,
  readResolvedConfig,
  orderPageFiles,
  walkPages,
  type CourseConfigRead,
  type WalkedLesson,
  type PageConfig,
} from './manifest.js';
import {
  clearParseCache,
  defaultExportFunctionPaths,
  findComponents,
  type ComponentMatch,
  getParseError,
  readCourseRuntimeExports,
  useQuestionGrading,
  usesLegacyModuleContext,
  type PropValue,
  type RuntimeXAPIHooks,
} from './ast.js';
import {
  validateAgent,
  validateAuthCredential,
  joinFieldError,
} from '../runtime/xapi/agent-rules.js';
import { httpOrigin } from '../runtime/xapi/derive-actor.js';
import {
  DEFAULT_STANDARD,
  STANDARDS,
  STANDARD_IDS,
  largerSuspendDataStandards,
  standardProfile,
  type StandardId,
} from '../runtime/standards.js';
import { slugFromQuestion } from '../components/util.js';
import {
  FEEDBACK_MODES,
  RETRY_MODES,
  courseIdentity,
  type CourseConfig,
  type ManualCompletion,
  type PercentageCompletion,
} from '../runtime/types.js';
import { contrastRatio } from './a11y/contrast.js';
import { isCspOverrides } from './csp.js';
import { isVideoEmbed } from '../components/video-embed.js';

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
const A11Y_IDS = {
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
function applyA11ySettings(d: Diagnostics, settings: A11ySettings): void {
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

/** Print notes (cyan), then warnings (yellow), then errors (red). Shared by the dev/build plugin and the CLI. */
export function reportValidationIssues({
  errors,
  warnings,
  infos = [],
}: ValidationResult): void {
  for (const info of infos) {
    console.log(`\x1b[36m[tessera]\x1b[0m ${info}`);
  }
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
  'id',
  'description',
  'author',
  'version',
  'resume',
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
const EXPORT_STANDARD_LIST = STANDARD_IDS.map((s) => `"${s}"`).join(', ');
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
export function validateProject(
  projectRoot: string,
  standardOverride?: StandardId,
  read: CourseConfigRead = readResolvedConfig(projectRoot, standardOverride),
): ValidationResult {
  clearParseCache();
  const d = new Diagnostics();

  // 1. Check course.config.js exists
  const configPath = resolve(projectRoot, 'course.config.js');
  if (!existsSync(configPath)) {
    d.error('course.config.js not found in project root');
    return d;
  }

  // 2. Parse and validate config
  const runtimeHooks = readRuntimeXAPIHooks(projectRoot, d);
  const config = parseConfig(projectRoot, d, runtimeHooks, read);

  // 3. Validate pages directory
  const pagesDir = resolve(projectRoot, 'pages');
  const assetsDir = resolve(projectRoot, 'assets');
  const pageResults = validatePages(
    pagesDir,
    assetsDir,
    projectRoot,
    d,
    config?.export?.standard,
  );

  // 4. Contract-bypass checks on project-root shell files
  for (const shellFile of ['layout.svelte', 'quiz.svelte']) {
    const shellPath = resolve(projectRoot, shellFile);
    if (existsSync(shellPath)) {
      validateContractBypass(readSourceFileCached(shellPath), shellFile, d);
    }
  }

  // 5. Cross-cutting validations
  if (config) {
    crossValidate(config, pageResults, d);
  }

  applyA11ySettings(d, normalizeA11y(config?.a11y));
  return d;
}

// ---------- Config Validation ----------

type ParsedConfig = Partial<Omit<CourseConfig, 'completion'>> & {
  completion?: Partial<
    Pick<CourseConfig['completion'], 'mode'> &
      Omit<ManualCompletion, 'mode'> &
      Omit<PercentageCompletion, 'mode'>
  >;
};

function parseConfig(
  projectRoot: string,
  d: Diagnostics,
  runtimeHooks: XAPIHookRead,
  read: CourseConfigRead,
): ParsedConfig | null {
  if (!read.ok) {
    // 'missing' can't occur — validateProject checks existsSync first.
    if (read.reason === 'no-export') {
      d.error('course.config.js: must use `export default { ... }` syntax');
    } else if (read.reason === 'parse-error') {
      reportConfigParseError(projectRoot, d);
    }
    return null;
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

  if (config.completion?.requireSuccessStatus !== undefined) {
    if (config.completion.mode !== 'manual') {
      d.warn(
        `course.config.js: "completion.requireSuccessStatus" is ignored unless completion.mode is "manual"`,
      );
    } else if (
      !VALID_REQUIRE_SUCCESS_STATUS.includes(
        config.completion.requireSuccessStatus,
      )
    ) {
      d.error(
        `course.config.js: "completion.requireSuccessStatus" must be "passed" or "failed" (omit for "unknown"), got "${config.completion.requireSuccessStatus}"`,
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

  // Validate scoring.passingScore
  if (config.scoring?.passingScore !== undefined) {
    const score = config.scoring.passingScore;
    if (typeof score !== 'number' || score < 0 || score > 100) {
      d.error(
        `course.config.js: "scoring.passingScore" must be 0–100, got ${score}`,
      );
    }
  }

  // Validate completion.percentageThreshold
  if (config.completion?.percentageThreshold !== undefined) {
    const threshold = config.completion.percentageThreshold;
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
      d.error(
        `course.config.js: "completion.percentageThreshold" must be 0–100, got ${threshold}`,
      );
    }
  }

  validateXAPIConfig(config.xapi, standard, runtimeHooks, d);

  return config;
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
function describeType(raw: unknown): string {
  return raw === null ? 'null' : Array.isArray(raw) ? 'array' : typeof raw;
}

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

// ---------- xAPI Config Validation ----------

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type XAPIHookRead = RuntimeXAPIHooks | 'none' | 'unknown';

function readRuntimeXAPIHooks(
  projectRoot: string,
  d: Diagnostics,
): XAPIHookRead {
  const runtimePath = resolve(projectRoot, 'course.runtime.js');
  if (!existsSync(runtimePath)) return 'none';
  const runtime = readCourseRuntimeExports(readSourceFileCached(runtimePath));
  if (!runtime) {
    d.error('course.runtime.js: could not parse, JavaScript syntax error');
    return 'unknown';
  }
  if (runtime.hasDefaultExport) {
    d.error(
      'course.runtime.js: export default is ignored. Use named exports: `export function canAccess`, `export const xapi`.',
    );
  }
  return runtime.xapi;
}

function hookState(
  hooks: XAPIHookRead,
  id: unknown,
  key: 'auth' | 'actor',
): 'yes' | 'no' | 'unknown' {
  if (hooks === 'unknown') return 'unknown';
  if (hooks === 'none' || typeof id !== 'string') return 'no';
  const keys = hooks.get(id);
  if (keys === 'unknown') return 'unknown';
  return keys?.has(key) ? 'yes' : 'no';
}

function validateHookIds(
  hooks: XAPIHookRead,
  ids: ReadonlySet<string>,
  d: Diagnostics,
): void {
  if (!(hooks instanceof Map)) return;
  for (const id of hooks.keys()) {
    if (!ids.has(id)) {
      d.error(
        `course.runtime.js: xapi[${JSON.stringify(id)}] matches no explicit xapi destination id in course.config.js`,
      );
    }
  }
}

function validateXAPIConfig(
  raw: unknown,
  standard: StandardId,
  hooks: XAPIHookRead,
  d: Diagnostics,
): void {
  if (raw === undefined || raw === null) {
    validateHookIds(hooks, new Set(), d);
    return;
  }

  // Normalize to array form. The single-object case is shorthand for a
  // one-element array — same machinery, no special case in the runtime.
  const entries: unknown[] = Array.isArray(raw) ? raw : [raw];

  if (Array.isArray(raw)) {
    if (entries.length === 0) {
      d.error(
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
      d.error(
        "course.config.js: xapi has multiple entries with endpoint: 'lms' — only one launch-inherited destination is allowed",
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
        d.warn(
          `course.config.js: xapi has ${count} entries with endpoint "${ep}" — usually a copy-paste mistake; ` +
            'fan-out to the same LRS with different actors/activityIds is supported but uncommon.',
        );
      }
    }
  } else if (typeof raw !== 'object') {
    d.error('course.config.js: xapi must be an object or an array of objects');
    return;
  }

  const ids = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const label = Array.isArray(raw) ? `xapi[${i}]` : 'xapi';
    if (!entry || typeof entry !== 'object') {
      d.error(`course.config.js: ${label} must be an object`);
      continue;
    }
    validateSingleXAPIEntry(
      entry as Record<string, unknown>,
      label,
      standard,
      hooks,
      ids,
      d,
    );
  }
  validateHookIds(hooks, ids, d);
}

function validateSingleXAPIEntry(
  entry: Record<string, unknown>,
  label: string,
  standard: StandardId,
  hooks: XAPIHookRead,
  ids: Set<string>,
  d: Diagnostics,
): void {
  const endpoint = entry.endpoint;
  const id = entry.id;
  const profile = standardProfile(standard);
  if (endpoint !== 'lms' && typeof id === 'string' && id) {
    if (ids.has(id)) {
      d.error(
        `course.config.js: xapi has more than one destination with id ${JSON.stringify(id)}; ids must be unique`,
      );
    }
    ids.add(id);
  }
  if (endpoint === undefined) {
    d.error(`course.config.js: ${label}.endpoint is required`);
    return;
  }
  if (typeof endpoint !== 'string') {
    d.error(`course.config.js: ${label}.endpoint must be a string`);
    return;
  }

  if (endpoint === 'lms') {
    // 'lms' inherits the LRS from the launch — only the launch-based
    // standards (cmi5, plain xAPI) carry one. The runtime drops the entry, so
    // one config can still export to every standard.
    if (profile && !profile.hasLaunchLRS) {
      d.warn(
        `course.config.js: ${label}.endpoint: 'lms' has no launch LRS under export.standard "${standard}" — ` +
          'this entry is ignored. Give it an explicit LRS endpoint to send statements from this package.',
      );
    }
    // Forbid extra fields — everything is inherited from the launch.
    const forbidden = [
      'auth',
      'actor',
      'activityId',
      'registration',
      'actorAccountHomePage',
    ];
    for (const f of forbidden) {
      if (entry[f] !== undefined) {
        d.error(
          `course.config.js: ${label}.${f} must be omitted when ${label}.endpoint is 'lms' — it is inherited from the launch.`,
        );
      }
    }
    return;
  }

  if (id === undefined) {
    d.error(
      `course.config.js: ${label}.id is required. course.runtime.js keys its xapi resolvers by it.`,
    );
  } else if (typeof id !== 'string' || id === '') {
    d.error(`course.config.js: ${label}.id must be a non-empty string`);
  }
  const hookRef =
    typeof id === 'string' && id
      ? `xapi[${JSON.stringify(id)}]`
      : `xapi[<${label}.id>]`;

  // Explicit endpoint — must be an absolute http(s) URL.
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    d.error(
      `course.config.js: ${label}.endpoint must be an absolute http(s) URL, got "${endpoint}"`,
    );
    return;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    d.error(
      `course.config.js: ${label}.endpoint must use http: or https:, got "${url.protocol}"`,
    );
    return;
  }
  if (url.protocol === 'http:' && process.env.NODE_ENV === 'production') {
    d.warn(
      `course.config.js: ${label}.endpoint uses http:; LRS credentials will travel in cleartext. Use https in production.`,
    );
  }
  if (!endpoint.endsWith('/')) {
    d.warn(
      `course.config.js: ${label}.endpoint should end with a slash to avoid concatenation surprises ` +
        `(e.g. 'https://lrs.example.com/xapi/' not 'https://lrs.example.com/xapi'). Runtime normalizes regardless.`,
    );
  }

  // auth: required for explicit endpoints, from the config or a resolver.
  const auth = entry.auth;
  const authHook = hookState(hooks, id, 'auth');
  if (auth === undefined) {
    if (authHook === 'no') {
      d.error(
        `course.config.js: ${label}.auth is required. Set a credential string, or export ${hookRef}.auth from course.runtime.js.`,
      );
    }
  } else if (typeof auth !== 'string') {
    d.error(
      `course.config.js: ${label}.auth must be a string, got ${describeType(auth)}`,
    );
  } else if (authHook === 'yes') {
    d.error(
      `course.config.js: ${label}.auth is also resolved by ${hookRef}.auth in course.runtime.js. Keep one.`,
    );
  } else {
    const authErr = validateAuthCredential(auth);
    if (authErr) {
      d.error(`course.config.js: ${joinFieldError(`${label}.auth`, authErr)}`);
    } else {
      d.warn(
        `course.config.js: ${label}.auth is a static string and will be embedded in the bundle. ` +
          `For production, export a ${hookRef}.auth resolver from course.runtime.js that fetches a short-lived token from a server endpoint.`,
      );
    }
  }

  // activityId — required IRI.
  const activityId = entry.activityId;
  if (activityId === undefined || activityId === '') {
    d.error(`course.config.js: ${label}.activityId is required`);
  } else if (typeof activityId !== 'string') {
    d.error(`course.config.js: ${label}.activityId must be a string`);
  } else {
    try {
      // Any absolute IRI — the URL constructor accepts uncommon schemes.
      new URL(activityId);
    } catch {
      d.error(
        `course.config.js: ${label}.activityId must be an absolute IRI, got "${activityId}"`,
      );
    }
  }

  // actor — required under web; optional otherwise.
  const actor = entry.actor;
  const actorHook = hookState(hooks, id, 'actor');
  if (actor === undefined) {
    if (profile?.packaged === false && actorHook === 'no') {
      d.error(
        `course.config.js: ${label}.actor is required for web export: there is no LMS to derive a learner identity from. ` +
          `Set a static Agent object, or export ${hookRef}.actor from course.runtime.js to resolve one (e.g. from your auth system).`,
      );
    }
  } else if (typeof actor !== 'object' || actor === null) {
    d.error(
      `course.config.js: ${label}.actor must be an Agent object, got ${describeType(actor)}`,
    );
  } else if (actorHook === 'yes') {
    d.error(
      `course.config.js: ${label}.actor is also resolved by ${hookRef}.actor in course.runtime.js. Keep one.`,
    );
  } else {
    const err = validateAgent(actor);
    if (err) {
      d.error(`course.config.js: ${joinFieldError(`${label}.actor`, err)}`);
    }
  }

  // actorAccountHomePage — optional, only meaningful under SCORM with no
  // explicit actor.
  const aahp = entry.actorAccountHomePage;
  if (aahp !== undefined) {
    if (typeof aahp !== 'string') {
      d.error(
        `course.config.js: ${label}.actorAccountHomePage must be a string`,
      );
    } else {
      try {
        new URL(aahp);
      } catch {
        d.error(
          `course.config.js: ${label}.actorAccountHomePage must be an absolute URL`,
        );
      }
    }
    if (actor !== undefined || actorHook === 'yes') {
      d.warn(
        `course.config.js: ${label}.actorAccountHomePage is ignored when ${label}.actor is supplied explicitly.`,
      );
    }
    if (profile && !profile.derivesLearnerActor) {
      d.warn(
        `course.config.js: ${label}.actorAccountHomePage is only used under ${STANDARD_IDS.filter((id) => STANDARDS[id].derivesLearnerActor).join('/')} actor synthesis; ignored under "${standard}".`,
      );
    }
  }

  // SCORM with auto-derived actor and a non-http(s) activityId:
  // actorAccountHomePage becomes required.
  if (
    actor === undefined &&
    actorHook === 'no' &&
    profile?.derivesLearnerActor &&
    typeof activityId === 'string' &&
    httpOrigin(activityId) === null &&
    aahp === undefined
  ) {
    d.error(
      `course.config.js: ${label}.activityId is not an http(s) URL, so its origin can't be used as the SCORM actor's account.homePage. ` +
        `Provide ${label}.actorAccountHomePage explicitly.`,
    );
  }

  // registration — optional UUID v4.
  const registration = entry.registration;
  if (registration !== undefined) {
    if (typeof registration !== 'string' || !UUID_RE.test(registration)) {
      d.error(
        `course.config.js: ${label}.registration must be a UUID v4, got "${String(registration)}"`,
      );
    }
    if (profile && !profile.hasLaunchLRS) {
      d.warn(
        `course.config.js: ${label}.registration is a cmi5 concept; the LRS will accept it under "${standard}" but most analytics tools won't know what to do with it.`,
      );
    }
  }
}

// ---------- Pages Validation ----------

interface PageInfo {
  fileRel: string;
  navIndex: number;
  graded: boolean;
  hasQuiz: boolean;
  weight?: number;
  completesOnView: boolean;
}

interface PagesValidationResult {
  totalPages: number;
  totalQuizzes: number;
  hasGraded: boolean;
  hasParseErrors: boolean;
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
  d: Diagnostics,
  assetExistsCache: Map<string, boolean>,
  exportStandard?: string,
): {
  page: PageInfo;
  isQuiz: boolean;
  parseError: boolean;
} {
  const fileRel = relative(projectRoot, filePath);
  const content = readSourceFileCached(filePath);

  const parseError = getParseError(content);
  if (parseError) {
    d.error(`${fileRel}: could not parse — ${parseError}`);
    return {
      page: {
        fileRel,
        navIndex,
        graded: false,
        hasQuiz: false,
        completesOnView: false,
      },
      isQuiz: false,
      parseError: true,
    };
  }

  const pageConfig = validatePageConfig(content, fileRel, d);

  const isQuiz = !!pageConfig?.quiz;
  let isGradedQuiz = false;
  if (pageConfig?.quiz) {
    validateQuizConfig(pageConfig.quiz, fileRel, d);
    if ((pageConfig.quiz as { graded?: unknown }).graded === true) {
      isGradedQuiz = true;
    }
  }

  const completesOnView = validateCompletesOn(pageConfig, fileRel, d);
  const declaresGraded = validatePageGraded(pageConfig, fileRel, d);
  const weight = validatePageWeight(pageConfig, fileRel, d);
  const graded = isGradedQuiz || declaresGraded;
  const hasCustomWidget = hasLocalModuleImport(content);
  const questionComponents =
    findComponents(content, QUESTION_COMPONENT_NAMES) ?? [];
  const useQuestions = useQuestionGrading(content);
  if (declaresGraded && isQuiz && !isGradedQuiz) {
    d.error(
      `${fileRel}: pageConfig.graded is set on a quiz page whose quiz is not graded. ` +
        "The quiz ignores a question's own `graded`, so nothing on the page can earn a score " +
        'and it never completes. ' +
        'Use quiz: { graded: true }, or drop graded: true.',
    );
  }
  if (weight !== undefined && !graded) {
    d.warn(
      `${fileRel}: pageConfig.weight only applies to a page that counts toward the course score. ` +
        'Without `graded: true` (or `quiz: { graded: true }`) the page never joins the rollup, ' +
        'so the weight is ignored.',
    );
  }
  const gradesUndeclared =
    !declaresGraded &&
    !isQuiz &&
    (useQuestions === 'graded' ||
      questionComponents.some(isLiterallyGradedQuestion));
  if (gradesUndeclared) {
    d.error(
      `${fileRel}: a question on this page is graded, but pageConfig does not declare graded: true, ` +
        'so its score never reaches the course score or passed/failed. Add graded: true to ' +
        'pageConfig, or drop graded from the question.',
    );
  }

  validateAssetRefs(content, fileRel, assetsDir, d, assetExistsCache);
  validateQuestionComponents(content, fileRel, d, exportStandard);
  validateMediaComponents(content, fileRel, d);
  validateHeadingOrder(content, fileRel, d);
  validateContractBypass(content, fileRel, d);
  if (
    (isQuiz || declaresGraded) &&
    useQuestions === 'absent' &&
    questionComponents.length === 0 &&
    !hasCustomWidget
  ) {
    d.warn(
      `${fileRel}: ${isQuiz ? 'quiz' : 'graded'} page has no question ` +
        `components or useQuestion() calls — it will have nothing to score`,
    );
  } else if (
    declaresGraded &&
    !isQuiz &&
    !hasCustomWidget &&
    !questionComponents.some(isGradedQuestion) &&
    (useQuestions === 'absent' || useQuestions === 'none')
  ) {
    d.warn(
      `${fileRel}: pageConfig.graded is set but no question on the page is graded — ` +
        `the page can never earn a score, so under completion.mode "percentage" it ` +
        `never completes. Mark at least one question component \`graded\`, or build one ` +
        `with useQuestion({ graded: true }).`,
    );
  }

  return {
    page: {
      fileRel,
      navIndex,
      graded,
      hasQuiz: isQuiz,
      ...(weight !== undefined ? { weight } : {}),
      completesOnView,
    },
    isQuiz,
    parseError: false,
  };
}

function validatePages(
  pagesDir: string,
  assetsDir: string,
  projectRoot: string,
  d: Diagnostics,
  exportStandard?: StandardId,
): PagesValidationResult {
  const pages: PageInfo[] = [];
  let totalPages = 0;
  let totalQuizzes = 0;
  let hasGraded = false;
  let hasParseErrors = false;
  // One existsSync per unique asset for the whole pass.
  const assetExistsCache = new Map<string, boolean>();

  const noPages = (): PagesValidationResult => {
    d.error(
      'No pages found. Create at least one section with a lesson and page in pages/',
    );
    return { totalPages, totalQuizzes, hasGraded, hasParseErrors, pages };
  };

  if (!existsSync(pagesDir)) return noPages();

  // walkPages only descends into section dirs, so scan pages/ root separately.
  for (const entry of readdirSync(pagesDir)) {
    const fullPath = resolve(pagesDir, entry);
    if (entry.endsWith('.svelte') && statSync(fullPath).isFile()) {
      d.warn(
        `${relative(projectRoot, fullPath)}: this file is outside the section/lesson structure and will be ignored`,
      );
    }
  }

  const sections = walkPages(pagesDir);
  if (sections.length === 0) return noPages();

  // For a flat lesson `meta` is the section's _meta. Same ordering as generateManifest.
  const validateLesson = (
    lesson: WalkedLesson,
    meta: { pages?: string[] } | null,
  ): void => {
    if (meta?.pages) {
      for (const pageName of meta.pages) {
        const fileName = ensureSvelteSuffix(pageName);
        if (!lesson.files.includes(fileName)) {
          d.error(
            `${relative(projectRoot, lesson.metaPath)}: pages array lists "${pageName}" but ${fileName} not found in this directory`,
          );
        }
      }
    }
    if (meta?.pages && meta.pages.length > 0) {
      const listedSet = new Set(meta.pages.map(ensureSvelteSuffix));
      for (const file of lesson.files) {
        if (!listedSet.has(file)) {
          d.warn(
            `${relative(projectRoot, resolve(lesson.dir, file))}: not listed in _meta.js pages array — will be appended at end`,
          );
        }
      }
    }

    for (const fileName of orderPageFiles(lesson.files, meta?.pages)) {
      const result = validatePageFile(
        resolve(lesson.dir, fileName),
        projectRoot,
        assetsDir,
        totalPages,
        d,
        assetExistsCache,
        exportStandard,
      );
      totalPages++;
      if (result.isQuiz) totalQuizzes++;
      if (result.page.graded) hasGraded = true;
      if (result.parseError) hasParseErrors = true;
      pages.push(result.page);
    }
  };

  for (const section of sections) {
    const sectionRel = relative(projectRoot, section.dir);
    const pagesBeforeSection = totalPages;

    const sectionMeta = validateMetaFile(section.metaPath, sectionRel, d);

    for (const lesson of section.lessons) {
      if (lesson.name === null) {
        // Flat lesson uses the section _meta, already validated above.
        validateLesson(lesson, sectionMeta);
      } else {
        const meta = validateMetaFile(
          lesson.metaPath,
          relative(projectRoot, lesson.dir),
          d,
        );
        validateLesson(lesson, meta);
      }
    }

    // The page-count delta covers both the no-lessons and empty-lessons cases.
    if (totalPages === pagesBeforeSection) {
      d.warn(`${sectionRel}: section contributed no pages and will be empty`);
    }
  }

  if (totalPages === 0) return noPages();

  return { totalPages, totalQuizzes, hasGraded, hasParseErrors, pages };
}

// ---------- _meta.js Validation ----------

function validateMetaFile(
  metaPath: string,
  parentRel: string,
  d: Diagnostics,
): { title?: string; pages?: string[] } | null {
  if (!existsSync(metaPath)) return null;

  const metaRel = `${parentRel}/_meta.js`;
  const result = extractDefaultExportObjectLiteral(
    readSourceFileCached(metaPath),
  );

  if (result.kind === 'parse-error') {
    d.error(`${metaRel}: could not parse — JavaScript syntax error`);
    return null;
  }
  if (result.kind !== 'literal') {
    d.error(`${metaRel}: syntax error — must export default { title: "..." }`);
    return null;
  }

  let meta: { title?: string; pages?: string[] };
  try {
    meta = JSON5.parse(result.text);
  } catch {
    d.error(`${metaRel}: syntax error — must export default { title: "..." }`);
    return null;
  }

  if (!meta.title) {
    d.error(`${metaRel}: missing required "title" field`);
  }

  return meta;
}

// ---------- pageConfig Validation ----------

function validatePageConfig(
  content: string,
  fileRel: string,
  d: Diagnostics,
): Partial<Record<keyof PageConfig, unknown>> | null {
  if (usesLegacyModuleContext(content)) {
    d.error(
      `${fileRel}: <script context="module"> is not supported; use <script module>`,
    );
  }
  const result = parsePageConfigFromSource(content);
  if (result.kind === 'ok') return result.value;
  if (result.kind === 'invalid') {
    d.error(
      `${fileRel}: pageConfig must be a static object literal (no variables, function calls, or computed values)`,
    );
  }
  return null;
}

function validateCompletesOn(
  pageConfig: { completesOn?: unknown } | null,
  fileRel: string,
  d: Diagnostics,
): boolean {
  if (!pageConfig || pageConfig.completesOn === undefined) return false;
  if (pageConfig.completesOn === 'view') return true;
  d.error(
    `${fileRel}: pageConfig.completesOn must be "view", got ${JSON.stringify(pageConfig.completesOn)}`,
  );
  return false;
}

function validatePageGraded(
  pageConfig: { graded?: unknown } | null,
  fileRel: string,
  d: Diagnostics,
): boolean {
  const graded = pageConfig?.graded;
  if (graded === undefined) return false;
  if (typeof graded !== 'boolean') {
    d.error(
      `${fileRel}: pageConfig.graded must be a boolean, got ${JSON.stringify(graded)}`,
    );
    return false;
  }
  return graded;
}

function validatePageWeight(
  pageConfig: { weight?: unknown } | null,
  fileRel: string,
  d: Diagnostics,
): number | undefined {
  const weight = pageConfig?.weight;
  if (weight === undefined) return undefined;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    d.warn(
      `${fileRel}: pageConfig.weight ${JSON.stringify(weight)} is not a positive finite number and is ignored (treated as 1)`,
    );
    return undefined;
  }
  return weight;
}

// ---------- Quiz Config Validation ----------

function validateQuizConfig(
  quiz: unknown,
  fileRel: string,
  d: Diagnostics,
): void {
  if (!quiz || typeof quiz !== 'object') return;
  const cfg = quiz as Record<string, unknown>;

  if (cfg.maxAttempts !== undefined) {
    const val = cfg.maxAttempts;
    if (
      val !== Infinity &&
      (typeof val !== 'number' || val <= 0 || !Number.isFinite(val))
    ) {
      d.error(
        `${fileRel}: quiz.maxAttempts must be a positive number or Infinity, got ${String(val)}`,
      );
    }
  }

  for (const field of ['graded', 'gatesProgress']) {
    if (cfg[field] !== undefined && typeof cfg[field] !== 'boolean') {
      d.error(
        `${fileRel}: quiz.${field} must be a boolean, got ${typeof cfg[field]}`,
      );
    }
  }

  if (
    cfg.feedbackMode !== undefined &&
    !VALID_FEEDBACK_MODES.includes(cfg.feedbackMode as string)
  ) {
    d.error(
      `${fileRel}: quiz.feedbackMode must be "review", "immediate", or "never", got "${String(cfg.feedbackMode)}"`,
    );
  }
  if (
    cfg.retryMode !== undefined &&
    !VALID_RETRY_MODES.includes(cfg.retryMode as string)
  ) {
    d.error(
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

const QUESTION_COMPONENT_NAMES = new Set(
  Object.keys(QUESTION_COMPONENT_REQUIRED),
);

/** Mirrors the `questionId(id, prefix, question)` prefix each widget passes. */
const QUESTION_ID_PREFIX: Record<string, string> = {
  MultipleChoice: 'mc',
  FillInTheBlank: 'fitb',
  Matching: 'matching',
  Sorting: 'sorting',
};

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
  d: Diagnostics,
  exportStandard?: string,
): void {
  const components = findComponents(content, QUESTION_COMPONENT_NAMES);
  if (!components) return;
  const profile = standardProfile(exportStandard);
  const format =
    profile && 'interactionFormat' in profile
      ? profile.interactionFormat
      : undefined;
  const seenIds = new Set<string>();
  const seenSanitized = new Set<string>();
  for (const { name, props, hasSpread } of components) {
    for (const req of QUESTION_COMPONENT_REQUIRED[name]) {
      if (!hasSpread && !props.has(req)) {
        d.error(`${fileRel}: <${name}> is missing required prop "${req}"`);
      }
    }

    // Rule 1.5: empty option/answer labels are both an a11y and a scoring bug.
    for (const labelProp of ['options', 'answers']) {
      const entries = staticArray(props.get(labelProp));
      if (entries?.some((e) => typeof e === 'string' && e.trim() === '')) {
        d.warn(
          tag(
            A11Y_IDS.questionLabel,
            `${fileRel}: <${name}> has an empty ${labelProp === 'options' ? 'option' : 'answer'} label`,
          ),
        );
      }
    }

    const idProp = props.get('id');
    const questionProp = props.get('question');
    // With no `id`, the widget derives one from the prompt text, so two
    // identically worded questions collide on one page.
    const derived = !hasSpread && !idProp && questionProp?.kind === 'string';
    const resolvedId =
      idProp?.kind === 'string'
        ? idProp.value
        : derived
          ? `${QUESTION_ID_PREFIX[name]}-${slugFromQuestion((questionProp as { value: string }).value)}`
          : null;

    if (resolvedId !== null) {
      if (seenIds.has(resolvedId)) {
        d.error(
          derived
            ? `${fileRel}: <${name}> has no id and its question text falls back to "${resolvedId}", which another question on this page already uses — give each an explicit id`
            : `${fileRel}: duplicate question id "${resolvedId}" — each question on a page needs a unique id`,
        );
      } else if (profile && format) {
        // The standard's identifier rules can rewrite ids, so distinct raw ids
        // can collide after sanitization. Skip raw duplicates (already flagged
        // above) to avoid double-reporting the same id.
        const sane = format.identifier(resolvedId);
        if (!derived && sane !== resolvedId) {
          d.warn(
            `${fileRel}: question id "${resolvedId}" will be rewritten to "${sane}" for ${profile.name} — use only letters and digits (underscores only between them)`,
          );
        }
        if (seenSanitized.has(sane)) {
          d.error(
            `${fileRel}: question id "${resolvedId}" collides with a prior id after ${profile.name} sanitization ("${sane}")`,
          );
        }
        seenSanitized.add(sane);
      }
      seenIds.add(resolvedId);
    }

    const weightProp = props.get('weight');
    if (weightProp?.kind === 'string') {
      d.warn(
        `${fileRel}: <${name}> weight="${weightProp.value}" is a string and is ignored (treated as 1) — pass a number: weight={${weightProp.value}}`,
      );
    } else {
      const weight = staticNumber(weightProp);
      if (weight !== null && !(Number.isFinite(weight) && weight > 0)) {
        d.warn(
          `${fileRel}: <${name}> weight ${weight} is not a positive finite number and is ignored (treated as 1)`,
        );
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
          d.error(
            `${fileRel}: <MultipleChoice> correct={${correct}} is out of range for ${options.length} options (valid: 0–${options.length - 1})`,
          );
        }
      }
      const optionFeedback = staticArray(props.get('optionFeedback'));
      if (options && optionFeedback && optionFeedback.length > options.length) {
        d.warn(
          `${fileRel}: <MultipleChoice> optionFeedback has ${optionFeedback.length} entries but only ${options.length} options — the extra entries can never be shown`,
        );
      }
    } else if (name === 'Sorting') {
      const items = staticArray(props.get('items'));
      const targets = staticArray(props.get('targets'));
      const correct = staticArray(props.get('correct'));
      if (items && correct && correct.length !== items.length) {
        d.error(
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
            d.error(
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
          d.error(
            `${fileRel}: <Matching> pairs must be an array of { left: string, right: string } objects`,
          );
        }
      }
    } else if (name === 'FillInTheBlank') {
      const answers = staticArray(props.get('answers'));
      if (answers) {
        if (answers.length === 0) {
          d.error(`${fileRel}: <FillInTheBlank> answers must not be empty`);
        } else if (answers.some((a) => typeof a !== 'string')) {
          d.error(
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

const SCRIPT_STYLE_RE = /<(script|style)\b[\s\S]*?<\/\1>/gi;

// Loop until stable: one pass can leave a reconstructed tag behind (e.g. `<scr<script></script>ipt>`).
function stripRepeated(input: string, patterns: RegExp[]): string {
  let out = input;
  for (const pattern of patterns) {
    let prev: string;
    do {
      prev = out;
      out = out.replace(pattern, '');
    } while (out !== prev);
  }
  return out;
}

/**
 * Sibling to validateQuestionComponents kept out of QUESTION_COMPONENT_REQUIRED
 * so media isn't treated as gradable questions.
 * Non-static (kind 'expr') values are skipped, matching the rest of the linter.
 */
function validateMediaComponents(
  content: string,
  fileRel: string,
  d: Diagnostics,
): void {
  const components = findComponents(
    content,
    new Set(['Image', 'Video', 'Audio']),
  );
  if (!components) return;
  for (const { name, props, hasSpread } of components) {
    if (name === 'Image') {
      const alt = props.get('alt');
      const decorative = props.get('decorative');
      // A string value is truthy at runtime (so decorative="false" hides the
      // image), but the parser sees a string, not a boolean — flag the misuse.
      if (decorative?.kind === 'string') {
        d.error(
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
      if (!hasDecorative && !hasSpread && (alt === undefined || altIsEmpty)) {
        d.error(
          tag(
            A11Y_IDS.imageAlt,
            `${fileRel}: <Image> needs alt text, or mark it decorative={true} if purely ornamental`,
          ),
        );
      }
      if (hasDecorative && alt?.kind === 'string' && alt.value.trim() !== '') {
        d.warn(
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
    if (!hasSpread && (title === undefined || titleIsEmpty)) {
      d.error(
        tag(
          A11Y_IDS.mediaTitle,
          `${fileRel}: <${name}> needs a title — it's the accessible name for the player`,
        ),
      );
    }
    const src = props.get('src');
    const isEmbed = src?.kind === 'string' && isVideoEmbed(src.value);
    if (
      name === 'Video' &&
      !hasSpread &&
      isEmbed &&
      props.get('transcript') === undefined
    ) {
      d.warn(
        tag(
          A11Y_IDS.mediaTranscript,
          `${fileRel}: <Video> embeds can't carry caption tracks — provide a transcript for WCAG 1.2`,
        ),
      );
    }
    if (
      name === 'Video' &&
      !hasSpread &&
      src?.kind === 'string' &&
      !isEmbed &&
      props.get('tracks') === undefined &&
      props.get('transcript') === undefined
    ) {
      d.warn(
        tag(
          A11Y_IDS.mediaCaptions,
          `${fileRel}: native <Video> has no caption tracks or transcript — add tracks={[…]} or a transcript for WCAG 1.2.2`,
        ),
      );
    }
    if (
      name === 'Audio' &&
      !hasSpread &&
      props.get('transcript') === undefined
    ) {
      d.warn(
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
  d: Diagnostics,
): void {
  const html = stripRepeated(content, [SCRIPT_STYLE_RE, HTML_COMMENT_RE]);
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((h) => Number(h[1]));
  let prevSeen: number | null = null;
  for (const level of levels) {
    if (prevSeen !== null && level - prevSeen > 1) {
      d.warn(
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
const IMPORT_SOURCE_RE = /from\s+['"]([^'"]+)['"]/g;

// A local import may wrap useQuestion, so its presence suppresses the "no
// questions" warning: false negatives are fine for an advisory heuristic.
function hasLocalModuleImport(content: string): boolean {
  for (const [, source] of content.matchAll(IMPORT_SOURCE_RE)) {
    if (!/^(?:\.{1,2}\/|\$)/.test(source)) continue;
    const file = source.slice(source.lastIndexOf('/') + 1);
    if (!file.includes('.') || /\.(?:svelte|js|ts)$/.test(file)) return true;
  }
  return false;
}

function isGradedQuestion({ props, hasSpread }: ComponentMatch): boolean {
  if (hasSpread) return true;
  const graded = props.get('graded');
  return !!graded && !(graded.kind === 'expr' && graded.raw === 'false');
}

function isLiterallyGradedQuestion({ props }: ComponentMatch): boolean {
  const graded = props.get('graded');
  return (
    graded?.kind === 'bool' ||
    (graded?.kind === 'expr' && graded.raw === 'true')
  );
}

/**
 * Detect ways an author file can bypass the LMS data contract. These check
 * source text for known escape hatches — they never inspect course content,
 * so they constrain how you wire things up, not what you build.
 */
function validateContractBypass(
  content: string,
  fileRel: string,
  d: Diagnostics,
): void {
  if (QUIZ_COMPLETE_DISPATCH_RE.test(content)) {
    d.error(
      `${fileRel}: dispatches "tessera-quiz-complete" directly. The event is a ` +
        `notification, not the scoring path; call useQuiz().submit() instead`,
    );
  }
  if (RUNTIME_INTERNAL_IMPORT_RE.test(content)) {
    d.error(
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
  d: Diagnostics,
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
      d.warn(
        `${fileRel}: "$assets/${assetPath}" not found in assets/ directory`,
      );
    }
  }
}

// ---------- Cross-Cutting Validations ----------

function reportEffectiveWeights(
  pageResults: PagesValidationResult,
  d: Diagnostics,
): void {
  const graded = pageResults.pages.filter((p) => p.graded);
  if (!graded.some((p) => p.weight !== undefined)) return;
  const total = graded.reduce((sum, p) => sum + (p.weight ?? 1), 0);
  const shares = graded
    .map((p) => `${p.fileRel} ${(((p.weight ?? 1) / total) * 100).toFixed(1)}%`)
    .join(', ');
  d.info(`course score weighting: ${shares}`);

  const unweighted = graded.filter((p) => p.weight === undefined);
  if (unweighted.length > 0) {
    d.warn(
      `course score weighting: these pages are graded without a pageConfig.weight, ` +
        `so each counts as 1 against pages that ` +
        `declare one: ${unweighted.map((p) => p.fileRel).join(', ')}`,
    );
  }

  if (graded.length < 2) return;
  // Percentage-style or all-fractional weights imply a scale to land on; bare
  // ratios like 2 and 3 imply none, so their total is never a typo.
  const weights = graded.map((p) => p.weight ?? 1);
  const scale = weights.some((w) => w >= 5)
    ? 100
    : weights.every((w) => w < 1)
      ? 1
      : undefined;
  if (scale !== undefined && Math.abs(total - scale) > scale * 1e-6) {
    d.warn(
      `course score weights sum to ${Number(total.toFixed(4))}, not ${scale}, and are scaled to that total. ` +
        `Add up to ${scale} to make each weight the page's percentage of the course score, ` +
        'or ignore this if the weights are meant as bare ratios.',
    );
  }
}

function crossValidate(
  config: ParsedConfig,
  pageResults: PagesValidationResult,
  d: Diagnostics,
): void {
  // completion.mode "quiz" but nothing declared graded
  if (
    config.completion?.mode === 'quiz' &&
    !pageResults.hasGraded &&
    !pageResults.hasParseErrors
  ) {
    d.error(
      'completion.mode is "quiz" but no pages declare quiz: { graded: true } or graded: true',
    );
  }

  // completion.mode "quiz" with an implicit pass threshold — the merge defaults
  // to 70, so this is a nudge, not an error.
  if (
    config.completion?.mode === 'quiz' &&
    config.scoring?.passingScore === undefined
  ) {
    d.warn(
      'completion.mode is "quiz" but scoring.passingScore is not set — defaulting to 70%. Set it explicitly to be sure.',
    );
  }

  if (!pageResults.hasParseErrors) reportEffectiveWeights(pageResults, d);

  const isManual = config.completion?.mode === 'manual';
  const completesOnPages = pageResults.pages.filter((p) => p.completesOnView);

  if (
    isManual &&
    config.completion?.trigger === 'page' &&
    completesOnPages.length === 0 &&
    !pageResults.hasParseErrors
  ) {
    d.error(
      'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view". ' +
        'Either add a completesOn page or remove the trigger field to drop the static check.',
    );
  }

  if (isManual) {
    for (const page of pageResults.pages) {
      if (page.graded) {
        d.warn(
          `${page.fileRel}: the page is graded under completion.mode: "manual". ` +
            'The score will be reported to the LMS for transcripts, but it will not drive ' +
            "completion or success status — `markComplete()` / completesOn does. If that's " +
            'not what you want, set graded: false or change completion.mode.',
        );
      }
    }
  }

  if (isManual && config.completion?.percentageThreshold !== undefined) {
    d.warn(
      'course.config.js: "completion.percentageThreshold" is ignored under completion.mode: "manual"',
    );
  }
  if (!isManual) {
    for (const page of completesOnPages) {
      d.warn(
        `${page.fileRel}: pageConfig.completesOn is ignored — completion.mode is "${config.completion?.mode ?? 'percentage'}"`,
      );
    }
  }
  for (const page of pageResults.pages) {
    if (page.completesOnView && page.hasQuiz) {
      d.warn(
        `${page.fileRel}: completion fires on view, before the quiz can be answered — likely a mistake`,
      );
    }
  }

  if (isManual) {
    const firstPage = pageResults.pages.find((p) => p.navIndex === 0);
    if (firstPage?.completesOnView) {
      d.warn(
        `${firstPage.fileRel}: pageConfig.completesOn: "view" is on the first page — the course will complete immediately on launch, before the learner sees any other content.`,
      );
    }
  }

  const profile = standardProfile(config.export?.standard);
  if (profile && 'suspendDataLimit' in profile) {
    // Estimate worst-case suspend_data size when all pages are visited, all
    // quizzes completed, all chunks revealed, and a modest amount of
    // usePersistence / standalone-question state has accumulated.
    //
    // SavedState shape (see runtime/persistence.ts) — single-letter keys:
    //   b (bookmark), v (visited[]), d (duration), c (chunk progress),
    //   g (per-page quiz + standalone scores), u (user state from usePersistence)
    //
    // We can't statically detect calls to `useQuestion({ graded: true })` or
    // `usePersistence`, so reserve a fixed buffer per page for those.
    let visitedChars = 0;
    for (let i = 0; i < pageResults.totalPages; i++) {
      visitedChars += String(i).length + 1; // digit chars + comma
    }
    const overhead = 60; // top-level JSON overhead with all keys
    // The `g` entry wrapper is budgeted once in standaloneBytes; a quiz adds
    // only its own fields.
    const quizBytes = pageResults.totalQuizzes * 14; // g entry: "s":100,"a":2,
    const chunkBytes = pageResults.totalPages * 12; // c: "NNN":NN,
    const standaloneBytes = pageResults.totalPages * 43; // g: "NNN":{"q":{"q1":[100,3,1],"q2":[40,3,1]}},
    const userStateBuffer = 256; // usePersistence headroom
    const estimatedSize =
      overhead +
      visitedChars +
      quizBytes +
      chunkBytes +
      standaloneBytes +
      userStateBuffer;

    const limit = profile.suspendDataLimit;
    if (estimatedSize > limit * 0.8) {
      const alternatives = largerSuspendDataStandards(limit)
        .map((id) => `"${id}"`)
        .join(', ');
      d.warn(
        `Course has ${pageResults.totalPages} pages with ${pageResults.totalQuizzes} quizzes — estimated ${profile.name} suspend_data ~${estimatedSize} bytes may exceed the ${limit}-byte limit when fully populated (visited + chunks + standalone scores + usePersistence). Consider one of ${alternatives}.`,
      );
    }
  }
}
