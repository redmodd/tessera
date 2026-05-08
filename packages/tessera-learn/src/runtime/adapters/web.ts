import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { CourseConfig } from '../types.js';
import type { Interaction } from '../interaction.js';
import { slugify } from '../slugify.js';

/**
 * Web persistence adapter — stores course state in localStorage.
 * Used for standalone web deployments (no LMS).
 */
export class WebAdapter implements PersistenceAdapter {
  #storageKey: string;
  #state: SavedState | null = null;

  constructor(config: CourseConfig) {
    const courseId = slugify(config.title || '') || 'tessera-course';
    this.#storageKey = `tessera-${courseId}`;
  }

  async init(): Promise<void> {
    try {
      const raw = localStorage.getItem(this.#storageKey);
      if (raw) {
        this.#state = JSON.parse(raw);
      }
    } catch {
      // Corrupted data or localStorage unavailable — start fresh
      this.#state = null;
    }
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    try {
      localStorage.setItem(this.#storageKey, JSON.stringify(state));
    } catch {
      // localStorage full or unavailable — silently fail
      console.warn('Tessera: Failed to save state to localStorage');
    }
  }

  // No-ops for web adapter — these are used by LMS adapters
  setScore(_score: number): void {}
  setCompletionStatus(_status: 'incomplete' | 'complete'): void {}
  setSuccessStatus(_status: 'passed' | 'failed' | 'unknown'): void {}
  setDuration(_seconds: number): void {}
  setExit(_mode: 'suspend' | 'normal'): void {}
  reportInteraction(
    _questionId: string,
    _interaction: Interaction,
    _correct: boolean | null
  ): void {
    // Web adapter has no external LMS; learner interaction data lives only
    // in memory. Authors who want to persist per-question state can use
    // `usePersistence(key)` which writes into SavedState.u.
  }
  commit(): void {}
  terminate(): void {}
}
