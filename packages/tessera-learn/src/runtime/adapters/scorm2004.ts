import { BaseScormAdapter, type ScormDialect } from './scorm-base.js';
import { formatISO8601Duration } from './retry.js';

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

const SCORM2004_DIALECT: ScormDialect<SCORM2004API> = {
  sessionTimeKey: 'cmi.session_time',
  formatDuration: formatISO8601Duration,
  interactionFields: {
    responseField: 'learner_response',
    timestampField: 'timestamp',
    timestamp: () => new Date().toISOString(),
    // SCORM 2004 accepts the canonical interaction `type` strings unchanged.
    typeValue: (t) => t,
    resultLabels: { correct: 'correct', incorrect: 'incorrect' },
  },
  initialize: (api) => api.Initialize(''),
  terminate: (api) => api.Terminate(''),
  getValue: (api, key) => api.GetValue(key),
  setValue: (api, key, value) => api.SetValue(key, value),
  commit: (api) => api.Commit(''),
  getLastError: (api) => api.GetLastError(),
  getErrorString: (api, code) => api.GetErrorString(code),
};

/**
 * SCORM 2004 persistence adapter.
 *
 * Uses a sequential write queue for all LMS SetValue/Commit calls.
 * On terminate, the queue is drained synchronously (single attempt)
 * since async retries cannot complete during page unload.
 */
export class SCORM2004Adapter extends BaseScormAdapter<SCORM2004API> {
  constructor(api: SCORM2004API) {
    super(api, SCORM2004_DIALECT);
  }

  setScore(score: number): void {
    this.queue.enqueue(() =>
      this.api.SetValue('cmi.score.raw', String(score))
    );
    this.queue.enqueue(() => this.api.SetValue('cmi.score.min', '0'));
    this.queue.enqueue(() => this.api.SetValue('cmi.score.max', '100'));
    this.queue.enqueue(() =>
      this.api.SetValue('cmi.score.scaled', String(score / 100))
    );
  }

  // Note: cmi.completion_threshold and cmi.scaled_passing_score are typically
  // set by the LMS, not the SCO. Tessera manages completion and passing
  // logic internally via course.config.js settings.
  setCompletionStatus(status: 'incomplete' | 'complete'): void {
    const value = status === 'complete' ? 'completed' : 'incomplete';
    this.queue.enqueue(() =>
      this.api.SetValue('cmi.completion_status', value)
    );
  }

  setSuccessStatus(status: 'passed' | 'failed' | 'unknown'): void {
    // "unknown" is a valid SCORM 2004 value — setting it explicitly prevents
    // LMSes (notably SCORM Cloud) from rolling up a null status to "passed".
    this.queue.enqueue(() => this.api.SetValue('cmi.success_status', status));
  }

  setExit(mode: 'suspend' | 'normal'): void {
    // SCORM 2004 §4.2 cmi.exit vocabulary: time-out, suspend, logout, normal, "".
    this.queue.enqueue(() => this.api.SetValue('cmi.exit', mode));
  }
}
