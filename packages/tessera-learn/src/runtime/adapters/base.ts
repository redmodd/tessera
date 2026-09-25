import type {
  CompletionStatus,
  ExitMode,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import type { Interaction } from '../interaction.js';
import type { XAPIAgent } from '../xapi/types.js';
import type { XAPIPublisher } from '../xapi/publisher.js';

/** What the LMS already holds for this attempt. */
export interface RecordedLifecycle {
  completed: boolean;
  passed: boolean;
  /** 0-100, or null when the LMS holds no score. */
  score: number | null;
}

/** Every adapter's optional capabilities default to no-ops, so callers never probe. */
export abstract class BaseAdapter {
  /** False only for `WebAdapter`: no LMS or launch LRS is behind it. */
  readonly connected: boolean = true;
  protected state: SavedState | null = null;
  protected masteryScore: number | null = null;
  protected recorded: RecordedLifecycle | null = null;

  /**
   * Connect to the LMS. Failure is fatal: nothing can be reported, so the
   * course must not start.
   */
  abstract init(): Promise<void>;
  abstract saveState(state: SavedState): void;

  getState(): SavedState | null {
    return this.state;
  }

  /**
   * Fetch previously saved state, where that costs a network round trip. Split
   * from `init()` so a stalled State API costs resume rather than the launch;
   * the adapter bounds the request itself and resolves either way. An adapter
   * that could not read its state must then refuse `saveState` rather than
   * overwrite what it failed to read.
   */
  async loadState(): Promise<void> {}

  /** LMS-supplied pass threshold in [0, 1], overriding `scoring.passingScore`; null when absent. */
  getMasteryScore(): number | null {
    return this.masteryScore;
  }

  /** The completion, pass and score the LMS holds from earlier sessions; null where the course can't read them back. */
  recordedLifecycle(): RecordedLifecycle | null {
    return this.recorded;
  }

  /**
   * Tell the adapter what was already emitted in prior sessions, so it skips
   * re-emitting on resume. Returns true when the adapter dedupes against the
   * seeded values; false means the caller re-reports them.
   */
  seedLifecycle(
    _completion: CompletionStatus,
    _success: SuccessStatus,
    _score?: number | null,
  ): boolean {
    return false;
  }

  /** Learner actor for an explicit xAPI destination, derived from the LMS; null when unavailable. */
  deriveActor(
    _activityId: string,
    _actorAccountHomePage?: string,
  ): XAPIAgent | null {
    return null;
  }

  /** The launch LRS publisher that `xapi.endpoint: 'lms'` shares; null without a launch LRS. */
  launchPublisher(): XAPIPublisher | null {
    return null;
  }

  setScore(_score: number): void {}
  setCompletionStatus(_status: CompletionStatus): void {}
  setSuccessStatus(_status: SuccessStatus): void {}
  setDuration(_seconds: number): void {}
  /** Tell the LMS how the learner is leaving the SCO. */
  setExit(_mode: ExitMode): void {}
  /**
   * Report a single learner interaction (answered question) to the LMS.
   * Called once per question on quiz submit or standalone useQuestion submit.
   */
  reportInteraction(
    _questionId: string,
    _interaction: Interaction,
    _correct: boolean | null,
  ): void {}
  commit(): void {}
  terminate(): void {}
}
