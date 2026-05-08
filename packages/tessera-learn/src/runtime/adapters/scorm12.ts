import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { buildScormInteractionFields, scorm12Type } from '../interaction-format.js';
import { WriteQueue, callSync, withRetry, formatHHMMSS } from './retry.js';

/**
 * SCORM 1.2 API interface.
 */
export interface SCORM12API {
  LMSInitialize(param: string): string;
  LMSFinish(param: string): string;
  LMSGetValue(element: string): string;
  LMSSetValue(element: string, value: string): string;
  LMSCommit(param: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(errorCode: string): string;
  LMSGetDiagnostic(errorCode: string): string;
}

/**
 * SCORM 1.2 persistence adapter.
 *
 * Uses a sequential write queue for all LMS SetValue/Commit calls.
 * On terminate, the queue is drained synchronously (single attempt)
 * since async retries cannot complete during page unload.
 */
export class SCORM12Adapter implements PersistenceAdapter {
  #api: SCORM12API;
  #queue = new WriteQueue();
  #state: SavedState | null = null;
  #terminated = false;

  // SCORM 1.2 combines completion and success into a single lesson_status field
  #completionStatus: string = 'incomplete';
  #successStatus: string | null = null;
  #interactionCount = 0;

  constructor(api: SCORM12API) {
    this.#api = api;
    // Wire up GetLastError/GetErrorString so retry warnings can name the
    // real LMS failure (e.g. "201 Invalid argument error") instead of a
    // generic "LMS call failed" — production triage needs the code.
    this.#queue.errorReporter = {
      code: () => this.#api.LMSGetLastError(),
      message: (c) => this.#api.LMSGetErrorString(c),
    };
  }

  /** Expose the underlying SCORM 1.2 API so xAPI actor synthesis can read learner fields. */
  getAPI(): SCORM12API {
    return this.#api;
  }

  async init(): Promise<void> {
    await withRetry(() => this.#api.LMSInitialize(''));

    try {
      const raw = this.#api.LMSGetValue('cmi.suspend_data');
      if (raw && raw.trim()) {
        this.#state = JSON.parse(raw);
      }
    } catch {
      this.#state = null;
    }

    // Continue cmi.interactions.n indexing where the previous session left
    // off. Restarting at 0 would overwrite prior records (the LMS uses n
    // as the array key, not an upsert field).
    try {
      const count = this.#api.LMSGetValue('cmi.interactions._count');
      const n = parseInt(count, 10);
      if (Number.isFinite(n) && n >= 0) this.#interactionCount = n;
    } catch {
      // Some LMSes throw on _count when no interactions exist — fall back to 0.
    }
  }

  getState(): SavedState | null {
    return this.#state;
  }

  saveState(state: SavedState): void {
    this.#state = state;
    const json = JSON.stringify(state);
    this.#queue.enqueue(() => this.#api.LMSSetValue('cmi.suspend_data', json));
  }

  setScore(score: number): void {
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue('cmi.core.score.raw', String(score))
    );
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue('cmi.core.score.min', '0')
    );
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue('cmi.core.score.max', '100')
    );
  }

  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    this.#completionStatus = status === 'complete' ? 'completed' : 'incomplete';
    this.#flushLessonStatus();
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    // SCORM 1.2 has no "unknown" lesson_status — clear the success override
    // so completion status drives lesson_status until a real result is known.
    this.#successStatus = status === 'unknown' ? null : status;
    this.#flushLessonStatus();
  }

  #flushLessonStatus(): void {
    // Success status takes priority — it's the more specific status
    const value = this.#successStatus ?? this.#completionStatus;
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue('cmi.core.lesson_status', value)
    );
  }

  setDuration(seconds: number): void {
    const formatted = formatHHMMSS(seconds);
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue('cmi.core.session_time', formatted)
    );
  }

  setExit(mode: 'suspend' | 'normal'): void {
    // SCORM 1.2 §4.2.2 vocabulary: time-out, suspend, logout, "" (normal).
    // We only map 'suspend' and the empty/normal case.
    const value = mode === 'suspend' ? 'suspend' : '';
    this.#queue.enqueue(() => this.#api.LMSSetValue('cmi.core.exit', value));
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
        responseField: 'student_response',
        timestampField: 'time',
        timestamp: new Date().toTimeString().slice(0, 8),
        typeValue: scorm12Type(interaction.type),
        resultLabels: { correct: 'correct', incorrect: 'wrong' },
      }
    );
    for (const [key, value] of fields) {
      this.#queue.enqueue(() => this.#api.LMSSetValue(key, value));
    }
  }

  commit(): void {
    this.#queue.enqueue(() => this.#api.LMSCommit(''));
  }

  terminate(): void {
    if (this.#terminated) return;
    this.#terminated = true;
    // During page unload, async retries can't run.
    // Drain any pending queue operations synchronously (single attempt each),
    // then commit and finish synchronously.
    this.#queue.drainSync();
    callSync(() => this.#api.LMSCommit(''));
    callSync(() => this.#api.LMSFinish(''));
  }
}
