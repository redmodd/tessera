/**
 * Persistence API — interface for saving/restoring course state.
 *
 * Step 9: Web adapter (localStorage)
 * Step 10: LMS adapters (SCORM 1.2, SCORM 2004, CMI5)
 */

export interface PersistenceAdapter {
  init(): Promise<void>;
  getState(): SavedState | null;
  saveState(state: SavedState): void;
  setScore(score: number): void;
  setCompletionStatus(status: 'incomplete' | 'complete'): void;
  setSuccessStatus(status: 'passed' | 'failed'): void;
  setDuration(seconds: number): void;
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
}
