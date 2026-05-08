import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { buildScormInteractionFields } from '../interaction-format.js';
import { WriteQueue, callSync, withRetry, formatISO8601Duration } from './retry.js';

/**
 * SCORM 2004 API interface.
 */
export interface SCORM2004API {
  Initialize(param: string): string;
  Terminate(param: string): string;
  GetValue(element: string): string;
  SetValue(element: string, value: string): string;
  Commit(param: string): string;
  GetLastError(): string;
  GetErrorString(errorCode: string): string;
  GetDiagnostic(errorCode: string): string;
}

/**
 * SCORM 2004 persistence adapter.
 *
 * Uses a sequential write queue for all LMS SetValue/Commit calls.
 * On terminate, the queue is drained synchronously (single attempt)
 * since async retries cannot complete during page unload.
 */
export class SCORM2004Adapter implements PersistenceAdapter {
  #api: SCORM2004API;
  #queue = new WriteQueue();
  #state: SavedState | null = null;
  #terminated = false;
  #interactionCount = 0;

  constructor(api: SCORM2004API) {
    this.#api = api;
    // Wire up GetLastError/GetErrorString so retry warnings can name the
    // real LMS failure (e.g. "405 Incorrect Data Type") instead of a
    // generic "LMS call failed" — production triage needs the code.
    this.#queue.errorReporter = {
      code: () => this.#api.GetLastError(),
      message: (c) => this.#api.GetErrorString(c),
    };
  }

  /** Expose the underlying SCORM 2004 API so xAPI actor synthesis can read learner fields. */
  getAPI(): SCORM2004API {
    return this.#api;
  }

  async init(): Promise<void> {
    await withRetry(() => this.#api.Initialize(''));

    try {
      const raw = this.#api.GetValue('cmi.suspend_data');
      if (raw && raw.trim()) {
        this.#state = JSON.parse(raw);
      }
    } catch {
      this.#state = null;
    }

    // Continue cmi.interactions.n indexing where the previous session left
    // off. Restarting at 0 would overwrite prior records.
    try {
      const count = this.#api.GetValue('cmi.interactions._count');
      const n = parseInt(count, 10);
      if (Number.isFinite(n) && n >= 0) this.#interactionCount = n;
    } catch {
      // Fallback to 0 if _count read fails.
    }
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    const json = JSON.stringify(state);
    this.#queue.enqueue(() => this.#api.SetValue('cmi.suspend_data', json));
  }

  setScore(score: number): void {
    this.#queue.enqueue(() =>
      this.#api.SetValue('cmi.score.raw', String(score))
    );
    this.#queue.enqueue(() => this.#api.SetValue('cmi.score.min', '0'));
    this.#queue.enqueue(() => this.#api.SetValue('cmi.score.max', '100'));
    this.#queue.enqueue(() =>
      this.#api.SetValue('cmi.score.scaled', String(score / 100))
    );
  }

  // Note: cmi.completion_threshold and cmi.scaled_passing_score are typically
  // set by the LMS, not the SCO. Tessera manages completion and passing
  // logic internally via course.config.js settings.
  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    const value = status === 'complete' ? 'completed' : 'incomplete';
    this.#queue.enqueue(() =>
      this.#api.SetValue('cmi.completion_status', value)
    );
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    // "unknown" is a valid SCORM 2004 value — setting it explicitly prevents
    // LMSes (notably SCORM Cloud) from rolling up a null status to "passed".
    this.#queue.enqueue(() =>
      this.#api.SetValue('cmi.success_status', status)
    );
  }

  setDuration(seconds: number): void {
    const formatted = formatISO8601Duration(seconds);
    this.#queue.enqueue(() =>
      this.#api.SetValue('cmi.session_time', formatted)
    );
  }

  setExit(mode: 'suspend' | 'normal'): void {
    // SCORM 2004 §4.2 cmi.exit vocabulary: time-out, suspend, logout, normal, "".
    this.#queue.enqueue(() => this.#api.SetValue('cmi.exit', mode));
  }

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null
  ): void {
    const n = this.#interactionCount++;
    const fields = buildScormInteractionFields(
      `cmi.interactions.${n}`,
      questionId,
      interaction,
      correct,
      {
        responseField: 'learner_response',
        timestampField: 'timestamp',
        timestamp: new Date().toISOString(),
        typeValue: interaction.type,
        resultLabels: { correct: 'correct', incorrect: 'incorrect' },
      }
    );
    for (const [key, value] of fields) {
      this.#queue.enqueue(() => this.#api.SetValue(key, value));
    }
  }

  commit(): void {
    this.#queue.enqueue(() => this.#api.Commit(''));
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // During page unload, async retries can't run.
    // Drain any pending queue operations synchronously (single attempt each),
    // then commit and terminate synchronously.
    this.#queue.drainSync();
    callSync(() => this.#api.Commit(''));
    callSync(() => this.#api.Terminate(''));
  }
}
