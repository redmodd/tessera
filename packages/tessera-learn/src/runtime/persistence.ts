/**
 * Persistence API — interface for saving/restoring course state.
 */

import type { Interaction } from './interaction.js';

export interface PersistenceAdapter {
  init(): Promise<void>;
  getState(): SavedState | null;
  saveState(state: SavedState): void;
  setScore(score: number): void;
  setCompletionStatus(status: 'incomplete' | 'complete'): void;
  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void;
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
    correct: boolean | null
  ): void;
  commit(): void;
  terminate(): void;
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
  /** Quiz scores — pageIndex (as string key) to score */
  q: Record<string, number>;
  /** Duration — accumulated seconds */
  d: number;
  /** Chunk progress — pageIndex (as string key) to highest revealed chunk index */
  c?: Record<string, number>;
  /** User-scoped state written via `usePersistence(key)`, keyed by caller. */
  u?: Record<string, unknown>;
  /** Standalone question scores — pageIndex → (questionId → score 0-100) */
  s?: Record<string, Record<string, number>>;
  /** Graded standalone page indices — pages with at least one graded standalone question */
  gs?: number[];
  /** Manual completion latch. 1 if the learner triggered manual completion. Absent otherwise. */
  m?: 1;
}
