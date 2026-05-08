import type { AccessFn } from './access.js';
import type { XAPIAgent } from './xapi/types.js';

/**
 * Per-page quiz configuration. Single source of truth — the build plugin
 * extracts this from `pageConfig.quiz` and embeds it in the manifest;
 * the runtime reads it from there. Keep field shapes in sync.
 */
export interface QuizConfig {
  graded?: boolean;
  gatesProgress?: boolean;
  maxAttempts?: number;
  showFeedback?: boolean;
  feedbackMode?: 'review' | 'immediate';
  retryMode?: 'full' | 'incorrect-only';
}

export interface CourseConfig {
  title: string;
  description?: string;
  author?: string;
  version?: string;
  branding?: {
    logo?: string;
    primaryColor?: string;
    fontFamily?: string;
  };
  navigation: {
    mode: 'free' | 'sequential';
    canAccess?: AccessFn;
  };
  completion: {
    mode: 'quiz' | 'percentage';
    percentageThreshold?: number;
  };
  scoring: {
    passingScore: number;
  };
  export: {
    standard: 'web' | 'scorm12' | 'scorm2004' | 'cmi5';
  };
  /**
   * Optional xAPI destination(s) for custom statement publishing via
   * `useXAPI()`. A single object or an array of destinations. Under cmi5
   * export, the sentinel `endpoint: 'lms'` re-uses the LMS launch's
   * credentials and shares the cmi5 adapter's queue.
   */
  xapi?: XAPIConfig | XAPIConfig[];
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
