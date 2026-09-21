/**
 * Persistence API: the lifecycle statuses and saved course state that adapters exchange.
 */

export type CompletionStatus = 'incomplete' | 'complete';
export type SuccessStatus = 'passed' | 'failed' | 'unknown';
export type ExitMode = 'suspend' | 'normal';

/** One page's entry in `SavedState.g`. */
export interface GradedUnitState {
  /** Best quiz score across attempts */
  s?: number;
  /** Submitted quiz attempts, omitted when 1 */
  a?: number;
  /**
   * Standalone question results — questionId → score 0-100 for a graded
   * question of weight 1, else [score, weight, graded].
   */
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
  /** Graded score latch. 1 once the course score and verdict were first reported. Absent otherwise. */
  s?: 1;
  /** Completion latch. 1 once the course reached complete. Absent otherwise. */
  k?: 1;
  /** Pass latch. 1 once the course reported passed. Absent otherwise. */
  p?: 1;
  /** Structure fingerprint (FNV-1a over ordered page slugs) at save time.
   * On resume, anything but an exact match discards the blob. */
  f?: string;
}
