import type { AccessFn } from './access.js';
import type { XAPIAgent } from './xapi/types.js';

/**
 * Quiz enum domains as runtime tuples. The unions below derive from these, and
 * the build-time validator imports them too — so the accepted value set has a
 * single source and can't drift between the types and the validator.
 */
export const FEEDBACK_MODES = ['review', 'immediate', 'never'] as const;
export const RETRY_MODES = ['full', 'incorrect-only'] as const;

/**
 * Trimmed course identity, or '' when absent. Single source of truth for the
 * "is there a usable id?" check shared by the web storage key, the cmi5/xAPI
 * id derivation, and the config validator.
 */
export function courseIdentity(config: { id?: unknown }): string {
  return (typeof config.id === 'string' && config.id.trim()) || '';
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

export interface CourseConfig {
  title: string;
  /** Stable, unique course identity (e.g. 'urn:uuid:…'). Seeds the web
   * localStorage key and the cmi5/xAPI LRS activity id; scaffolders generate one.
   * Absent → both fall back to a fixed value, colliding across courses. */
  id?: string;
  description?: string;
  author?: string;
  version?: string;
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
    canAccess?: AccessFn;
  };
  completion: ManualCompletion | QuizCompletion | PercentageCompletion;
  /** Optional under "manual"; required under "quiz". */
  scoring: {
    passingScore: number;
  };
  export: {
    standard: 'web' | 'scorm12' | 'scorm2004' | 'cmi5' | 'xapi';
  };
  /**
   * Optional xAPI destination(s) for custom statement publishing via
   * `useXAPI()`. A single object or an array of destinations. Under cmi5
   * export, the sentinel `endpoint: 'lms'` re-uses the LMS launch's
   * credentials and shares the cmi5 adapter's queue.
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

export interface ManualCompletion {
  mode: 'manual';
  /**
   * Set to "page" to opt into a build-time check that at least one page
   * declares `completesOn: "view"`. Omit to skip the check; both completion
   * paths still work at runtime.
   */
  trigger?: 'page';
  /** When set, markComplete() also flips successStatus. Omit for unknown. */
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
 * cmi5 launch-inherited destination. Only valid under `export.standard:
 * 'cmi5'`. Auth, actor, activityId, and registration are taken from the
 * launch URL, so no other fields are accepted.
 */
export interface XAPILMSConfig {
  endpoint: 'lms';
}

/**
 * Explicit LRS destination. The author provides every field. `actor` is
 * optional under SCORM (synthesized from `cmi.core.student_id` /
 * `cmi.learner_id`) and required under web.
 */
export interface XAPIExplicitConfig {
  /** Absolute http(s) URL of the LRS Statements endpoint base. */
  endpoint: string;
  /**
   * Basic-auth credential value (the part after "Basic "), or a function
   * that resolves one. Function form is re-invoked once on 401 to cover
   * short-lived tokens.
   */
  auth: string | (() => string | Promise<string>);
  /**
   * Identified Agent or a resolver function. Required for web export;
   * optional under SCORM where it can be synthesized from the LMS data
   * model. Optional under cmi5 where it can be inherited from the launch.
   */
  actor?: XAPIAgent | (() => XAPIAgent | Promise<XAPIAgent>);
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
