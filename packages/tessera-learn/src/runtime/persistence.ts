/**
 * Persistence API — interface for saving/restoring course state.
 */

import type { Interaction } from './interaction.js';

export interface PersistenceAdapter {
  /**
   * Connect to the LMS. Failure is fatal: nothing can be reported, so the
   * course must not start.
   */
  init(): Promise<void>;
  /**
   * Fetch previously saved state, where that costs a network round trip. Split
   * from `init()` so a stalled State API costs resume rather than the launch;
   * the adapter bounds the request itself and resolves either way. An adapter
   * that could not read its state must then refuse `saveState` rather than
   * overwrite what it failed to read.
   */
  loadState?(): Promise<void>;
  getState(): SavedState | null;
  saveState(state: SavedState): void;
  setScore(score: number): void;
  setCompletionStatus(status: 'incomplete' | 'complete'): void;
  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void;
  /** Tell the adapter what was already emitted in prior sessions, so it skips re-emitting on resume. */
  seedLifecycle?(
    completion: 'incomplete' | 'complete',
    success: 'unknown' | 'passed' | 'failed',
    score?: number | null,
  ): void;
  setDuration(seconds: number): void;
  /**
   * Tell the LMS how the learner is leaving the SCO. SCORM 1.2 maps
   * `'suspend'` → `cmi.core.exit = 'suspend'`, `'normal'` → empty (the
   * vocabulary has no explicit normal value). SCORM 2004 maps directly
   * onto `cmi.exit`. cmi5 / web adapters no-op.
   */
  setExit(mode: 'suspend' | 'normal'): void;
  /**
   * Report a single learner interaction (answered question) to the LMS.
   * Called once per question on quiz submit or standalone useQuestion submit.
   */
  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null,
  ): void;
  commit(): void;
  terminate(): void;
}

/** One page's entry in `SavedState.g`. */
export interface GradedUnitState {
  /** Best quiz score across attempts */
  s?: number;
  /** Submitted quiz attempts, omitted when 1 */
  a?: number;
  /** Standalone results — questionId → score 0-100 for a graded question of
   * weight 1, else [score, weight, graded] */
  q?: Record<string, number | [number, number, 0 | 1]>;
}

/**
 * Compact serialization format for course state.
 * Single-letter keys to minimize storage footprint (SCORM 1.2 suspend_data is 4KB).
 */
export interface SavedState {
  /** Bookmark — current page index */
  b: number;
  /** Visited — array of page indices */
  v: number[];
  /**
   * Graded units — pageIndex (as string key) to that page's score state.
   * Every sub-key is omitted when it carries nothing, and an attempt count of
   * 1 is assumed on restore, so a plain quiz page costs `"3":{"s":80}`.
   */
  g?: Record<string, GradedUnitState>;
  /** Duration — accumulated seconds */
  d: number;
  /** Chunk progress — pageIndex (as string key) to highest revealed chunk index */
  c?: Record<string, number>;
  /** User-scoped state written via `usePersistence(key)`, keyed by caller. */
  u?: Record<string, unknown>;
  /** Manual completion latch. 1 if the learner triggered manual completion. Absent otherwise. */
  m?: 1;
  /** Structure fingerprint (FNV-1a over ordered page slugs) at save time.
   * On resume, anything but an exact match discards the blob. */
  f?: string;
}
