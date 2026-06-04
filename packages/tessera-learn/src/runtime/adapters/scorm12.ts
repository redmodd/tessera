import {
  SCORM12_INTERACTION_FORMAT,
  scorm12Type,
} from '../interaction-format.js';
import type { SavedState } from '../persistence.js';
import { BaseScormAdapter, type ScormDialect } from './scorm-base.js';
import { formatHHMMSS, formatReal107 } from './format.js';

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

const SCORM12_DIALECT: ScormDialect<SCORM12API> = {
  sessionTimeKey: 'cmi.core.session_time',
  formatDuration: formatHHMMSS,
  suspendDataLimit: 4096,
  suspendDataLimitLabel: 'SCORM 1.2 cmi.suspend_data 4096-char',
  interactionFields: {
    responseField: 'student_response',
    timestampField: 'time',
    timestamp: () => new Date().toTimeString().slice(0, 8),
    typeValue: scorm12Type,
    resultLabels: { correct: 'correct', incorrect: 'wrong' },
    format: SCORM12_INTERACTION_FORMAT,
  },
  initialize: (api) => api.LMSInitialize(''),
  terminate: (api) => api.LMSFinish(''),
  getValue: (api, key) => api.LMSGetValue(key),
  setValue: (api, key, value) => api.LMSSetValue(key, value),
  commit: (api) => api.LMSCommit(''),
  getLastError: (api) => api.LMSGetLastError(),
  getErrorString: (api, code) => api.LMSGetErrorString(code),
  getDiagnostic: (api, code) => api.LMSGetDiagnostic(code),
};

/**
 * SCORM 1.2 persistence adapter.
 *
 * Uses a sequential write queue for all LMS SetValue/Commit calls.
 * On terminate, the queue is drained synchronously (single attempt)
 * since async retries cannot complete during page unload.
 *
 * SCORM 1.2 collapses completion + success into a single `lesson_status`
 * field, so the two setters track their values separately and write the
 * combined result through `#flushLessonStatus`.
 */
export class SCORM12Adapter extends BaseScormAdapter<SCORM12API> {
  // SCORM 1.2 combines completion and success into a single lesson_status field.
  #completionStatus: string = 'incomplete';
  #successStatus: string | null = null;

  constructor(api: SCORM12API) {
    super(api, SCORM12_DIALECT);
  }

  saveState(state: SavedState): void {
    super.saveState(state);
    // §3.4.5.3 — bookmark for LMS "Resume from page N" affordances.
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.lesson_location', String(state.b)),
      'cmi.core.lesson_location',
    );
  }

  setScore(score: number): void {
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.score.raw', formatReal107(score)),
      'cmi.core.score.raw',
    );
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.score.min', '0'),
      'cmi.core.score.min',
    );
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.score.max', '100'),
      'cmi.core.score.max',
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
    const value = this.#successStatus ?? this.#completionStatus;
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.lesson_status', value),
      'cmi.core.lesson_status',
    );
  }

  setExit(mode: 'suspend' | 'normal'): void {
    // SCORM 1.2 §4.2.2 vocabulary: time-out, suspend, logout, "" (normal).
    const value = mode === 'suspend' ? 'suspend' : '';
    this.queue.enqueue(
      () => this.api.LMSSetValue('cmi.core.exit', value),
      'cmi.core.exit',
    );
  }
}
