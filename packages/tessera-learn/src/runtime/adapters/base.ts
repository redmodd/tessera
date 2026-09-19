import type {
  CompletionStatus,
  SavedState,
  SuccessStatus,
} from '../persistence.js';
import type { Interaction } from '../interaction.js';
import type { XAPIAgent } from '../xapi/types.js';
import type { XAPIPublisher } from '../xapi/publisher.js';

/** Every adapter's optional capabilities default to no-ops, so callers never probe. */
export abstract class BaseAdapter {
  /** False only for `WebAdapter`: no LMS or launch LRS is behind it. */
  readonly connected: boolean = true;

  /**
   * Connect to the LMS. Failure is fatal: nothing can be reported, so the
   * course must not start.
   */
  abstract init(): Promise<void>;
  abstract getState(): SavedState | null;
  abstract saveState(state: SavedState): void;

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
    return null;
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
  deriveActor(_activityId: string, _homePage?: string): XAPIAgent | null {
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
  /**
   * Tell the LMS how the learner is leaving the SCO. SCORM 1.2 maps
   * `'suspend'` to `cmi.core.exit = 'suspend'` and `'normal'` to empty (the
   * vocabulary has no explicit normal value). SCORM 2004 maps directly onto
   * `cmi.exit`. cmi5 / xAPI / web adapters no-op.
   */
  setExit(_mode: 'suspend' | 'normal'): void {}
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
