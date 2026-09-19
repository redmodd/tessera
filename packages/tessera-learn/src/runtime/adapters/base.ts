import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import type { XAPIAgent } from '../xapi/types.js';
import type { XAPIPublisher } from '../xapi/publisher.js';

/** Every adapter's optional capabilities default to no-ops, so callers never probe. */
export abstract class BaseAdapter implements PersistenceAdapter {
  get connected(): boolean {
    return true;
  }

  abstract init(): Promise<void>;
  abstract getState(): SavedState | null;
  abstract saveState(state: SavedState): void;

  async loadState(): Promise<void> {}

  getMasteryScore(): number | null {
    return null;
  }

  seedLifecycle(
    _completion: 'incomplete' | 'complete',
    _success: 'unknown' | 'passed' | 'failed',
    _score?: number | null,
  ): boolean {
    return false;
  }

  deriveActor(_activityId: string, _homePage?: string): XAPIAgent | null {
    return null;
  }

  launchPublisher(): XAPIPublisher | null {
    return null;
  }

  setScore(_score: number): void {}
  setCompletionStatus(_status: 'incomplete' | 'complete'): void {}
  setSuccessStatus(_status: 'passed' | 'failed' | 'unknown'): void {}
  setDuration(_seconds: number): void {}
  setExit(_mode: 'suspend' | 'normal'): void {}
  reportInteraction(
    _questionId: string,
    _interaction: Interaction,
    _correct: boolean | null,
  ): void {}
  commit(): void {}
  terminate(): void {}
}
