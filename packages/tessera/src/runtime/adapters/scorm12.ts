import type { PersistenceAdapter, SavedState } from '../persistence.js';
import type { Interaction } from '../interaction.js';
import { formatResponse, formatCorrectPattern, scorm12Type } from '../interaction-format.js';
import { WriteQueue, callSync, withRetry, formatHHMMSS, findLMSAPI } from './retry.js';

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
 * Walk up window.opener and window.parent chain to find the SCORM 1.2 API.
 * Returns null if not found within 10 levels.
 */
export function findSCORM12API(): SCORM12API | null {
  return findLMSAPI('API') as SCORM12API | null;
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

  reportInteraction(
    questionId: string,
    interaction: Interaction,
    correct: boolean | null
  ): void {
    const n = this.#interactionCount++;
    const prefix = `cmi.interactions.${n}`;
    const response = formatResponse(interaction);
    const pattern = formatCorrectPattern(interaction);
    const time = new Date().toTimeString().slice(0, 8);
    this.#queue.enqueue(() => this.#api.LMSSetValue(`${prefix}.id`, questionId));
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue(`${prefix}.type`, scorm12Type(interaction.type))
    );
    this.#queue.enqueue(() =>
      this.#api.LMSSetValue(`${prefix}.student_response`, response)
    );
    if (pattern !== null) {
      this.#queue.enqueue(() =>
        this.#api.LMSSetValue(
          `${prefix}.correct_responses.0.pattern`,
          pattern
        )
      );
    }
    if (correct !== null) {
      this.#queue.enqueue(() =>
        this.#api.LMSSetValue(
          `${prefix}.result`,
          correct ? 'correct' : 'wrong'
        )
      );
    }
    this.#queue.enqueue(() => this.#api.LMSSetValue(`${prefix}.time`, time));
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
