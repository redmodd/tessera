import type { AccessFn } from './access.js';
import type { XAPIAgent } from './xapi/types.js';
import type { StandardId } from './standards.js';

/**
 * Enum domains as runtime tuples. The unions below derive from these, and
 * the build-time validator imports them too — so the accepted value set has a
 * single source and can't drift between the types and the validator.
 */
export const FEEDBACK_MODES = ['review', 'immediate', 'never'] as const;
export const RETRY_MODES = ['full', 'incorrect-only'] as const;
export const SUCCESS_SOURCES = ['quiz', 'fixed', 'none'] as const;

/**
 * Trimmed course identity, or '' when absent. Single source of truth for the
 * "is there a usable id?" check shared by the web storage key, the cmi5/xAPI
 * id derivation, and the config validator.
 */
export function courseIdentity(config: { id?: unknown }): string {
  return (typeof config.id === 'string' && config.id.trim()) || '';
}

interface SuccessSource {
  completion?: { mode?: string; requireSuccessStatus?: 'passed' | 'failed' };
  success?: SuccessConfig;
}

/**
 * What judges pass/fail, resolved from `success` or the `completion.mode`
 * preset that implies it. Single source of truth for the runtime rollup, the
 * validator, and the manifest generators, so the pass mark a package
 * declares can't disagree with the verdict it sends.
 */
export function resolveSuccess(config: SuccessSource): SuccessConfig {
  const declared = config.success;
  if (declared === undefined) {
    if (config.completion?.mode !== 'manual') return { from: 'quiz' };
    return asserted(config.completion.requireSuccessStatus);
  }
  if (declared.from === 'quiz') return { from: 'quiz' };
  if (declared.from === 'fixed') return asserted(declared.status);
  return { from: 'none' };
}

function asserted(status: string | undefined): SuccessConfig {
  return status === 'passed' || status === 'failed'
    ? { from: 'fixed', status }
    : { from: 'none' };
}

/**
 * Per-page quiz configuration. Single source of truth — the build plugin
 * extracts this from `pageConfig.quiz` and embeds it in the manifest;
 * the runtime reads it from there. Keep field shapes in sync.
 */
export interface QuizConfig {
  graded?: boolean;
  gatesProgress?: boolean;
  maxAttempts?: number;
  feedbackMode?: (typeof FEEDBACK_MODES)[number];
  retryMode?: (typeof RETRY_MODES)[number];
}

/**
 * Whether a page's score joins the course rollup. Shared so the criterion a
 * package declares and the rollup that feeds it count the same pages.
 */
export function isGradedPage(page: {
  quiz?: QuizConfig | null;
  graded?: boolean;
}): boolean {
  return !!(page.quiz?.graded || page.graded);
}

/**
 * Whether an unattempted page still counts, as a 0. Optional pages join the
 * rollup only once they have a score, so skipping one neither depresses the
 * course score nor decides the verdict.
 */
export function isRequiredGradedPage(page: {
  quiz?: QuizConfig | null;
  graded?: boolean;
  required?: boolean;
}): boolean {
  return isGradedPage(page) && page.required !== false;
}

export interface CourseConfig {
  title: string;
  /** Stable, unique course identity (e.g. 'urn:uuid:…'). Seeds the web
   * localStorage key and the cmi5/xAPI LRS activity id; scaffolders generate one.
   * Absent → both fall back to a fixed value, colliding across courses. */
  id?: string;
  description?: string;
  author?: string;
  version?: string;
  /** Resume policy. 'auto' (default) restores saved progress unless the page
   * structure changed since it was saved; 'never' always starts fresh. */
  resume?: 'auto' | 'never';
  /** BCP-47 language tag for <html lang>. Defaults to 'en'. WCAG 3.1.1. */
  language?: string;
  /** Accessibility checker configuration. */
  a11y?: A11yConfig;
  branding?: {
    logo?: string;
    primaryColor?: string;
    fontFamily?: string;
  };
  navigation: {
    mode: 'free' | 'sequential';
  };
  completion: ManualCompletion | QuizCompletion | PercentageCompletion;
  /**
   * What judges pass/fail, independent of what makes the course complete.
   * Omit to take the verdict implied by `completion.mode`.
   */
  success?: SuccessConfig;
  /** Optional under "manual"; required under "quiz". */
  scoring: {
    passingScore: number;
  };
  export: {
    standard: StandardId;
    /** Web export only: extend the baseline Content-Security-Policy. Each key is
     * a directive; its sources are appended (unioned) onto the baseline. `false`
     * drops the CSP meta entirely (for deployments that set a CSP header).
     * Ignored unless `standard` is 'web'. */
    csp?: false | Record<string, string[]>;
  };
  /**
   * Optional xAPI destination(s) for custom statement publishing via
   * `useXAPI()`. A single object or an array of destinations. Under cmi5 or
   * plain xAPI export, the sentinel `endpoint: 'lms'` re-uses the launch's
   * credentials and shares the launch adapter's queue.
   */
  xapi?: XAPIConfig | XAPIConfig[];
}

/** Accessibility checker configuration. */
export interface A11yConfig {
  /** Build-gate severity for promotable Tier-1 rules + Tier-1a warnings. */
  level?: 'warn' | 'error';
  /** axe ruleset tags for the Tier-2 runtime auditor. */
  standard?: 'wcag2a' | 'wcag2aa' | 'wcag21aa';
  /** Per-rule escape hatch matched literally against each diagnostic's ID. */
  ignore?: string[];
}

/**
 * The success axis. `quiz` judges the graded average against
 * `scoring.passingScore`; `fixed` asserts `status` when the course completes;
 * `none` reports completion and a score but never a verdict.
 */
export type SuccessConfig =
  | { from: Exclude<(typeof SUCCESS_SOURCES)[number], 'fixed'>; status?: never }
  | { from: 'fixed'; status: 'passed' | 'failed' };

export interface ManualCompletion {
  mode: 'manual';
  /**
   * Set to "page" to opt into a build-time check that at least one page
   * declares `completesOn: "view"`. Omit to skip the check; both completion
   * paths still work at runtime.
   */
  trigger?: 'page';
  /**
   * When set, markComplete() also flips successStatus. Omit for unknown.
   * Alias for `success: { from: "fixed", status }`, which outranks it.
   */
  requireSuccessStatus?: 'passed' | 'failed';
}

export interface QuizCompletion {
  mode: 'quiz';
}

export interface PercentageCompletion {
  mode: 'percentage';
  percentageThreshold?: number;
}

/**
 * Launch-inherited destination. Only used under `export.standard: 'cmi5'`
 * or `'xapi'`. Auth, actor, activityId, and registration are taken from the
 * launch URL, so no other fields are accepted.
 */
export interface XAPILMSConfig {
  endpoint: 'lms';
}

/**
 * Explicit LRS destination. `actor` is optional under SCORM (synthesized from
 * `cmi.core.student_id` / `cmi.learner_id`) and required under web.
 */
export interface XAPIExplicitConfig {
  /** Destination id. `course.runtime.js` keys its `xapi` resolvers by it. */
  id: string;
  /** Absolute http(s) URL of the LRS Statements endpoint base. */
  endpoint: string;
  /**
   * Basic-auth credential value (the part after "Basic "). Omit when
   * `course.runtime.js` exports an `auth` resolver for this destination.
   */
  auth?: string;
  /**
   * Identified Agent. Required for web export unless `course.runtime.js`
   * exports an `actor` resolver; optional under SCORM (synthesized from the
   * LMS data model) and cmi5 (inherited from the launch).
   */
  actor?: XAPIAgent;
  /** xAPI activity IRI scoped to this destination. */
  activityId: string;
  /** Optional UUID v4 — primarily a cmi5 launch concept. */
  registration?: string;
  /**
   * Override for the SCORM-derived actor's `account.homePage`. Defaults
   * to the activityId origin when activityId is http(s); required when
   * activityId uses a non-http(s) scheme.
   */
  actorAccountHomePage?: string;
}

export type XAPIConfig = XAPILMSConfig | XAPIExplicitConfig;

/** Runtime resolvers for one explicit xAPI destination. */
export interface XAPIDestinationHooks {
  /** Resolves the Basic-auth credential. Re-invoked once on 401 to cover short-lived tokens. */
  auth?: () => string | Promise<string>;
  /** Resolves the Identified Agent once per page load. */
  actor?: () => XAPIAgent | Promise<XAPIAgent>;
}

/** Named exports of the optional project-root `course.runtime.js`. */
export interface CourseRuntime {
  /** Page-access predicate. Replaces the `navigation.mode` preset. */
  canAccess?: AccessFn;
  /** Resolvers keyed by explicit xAPI destination `id`. */
  xapi?: Record<string, XAPIDestinationHooks>;
}
